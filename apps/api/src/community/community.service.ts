import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, TenantPrismaClient } from '@digisoft/db';
import type {
  AuthenticatedUser,
  CommunityCategoryInput,
  CreateReplyInput,
  CreateTopicInput,
  ListTopicsQuery,
  ModerateReplyInput,
  ModerateTopicInput,
  UpdateCommunityCategoryInput,
  UpdateTopicInput,
} from '@digisoft/shared';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { AppError } from '../common/errors/app-error';
import { AuditService } from '../audit/audit.service';
import { orderBy, pageMeta, toSkipTake } from '../common/dto/pagination';
import type { Paginated } from '../common/interceptors/response.interceptor';
import { uniqueSlug } from '../common/util/slug';

/** Who is looking. Agents see everything; a portal user also sees their own pending posts. */
export interface CommunityViewer {
  userId: string | null;
  isAgent: boolean;
}

const SORTABLE = ['lastActivityAt', 'createdAt', 'voteCount', 'replyCount', 'title'] as const;

const AUTHOR_SELECT = { id: true, firstName: true, lastName: true, type: true } as const;

const CATEGORY_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  visibility: true,
  position: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { topics: true } },
} as const;

const TOPIC_SELECT = {
  id: true,
  title: true,
  slug: true,
  body: true,
  type: true,
  status: true,
  moderation: true,
  isPinned: true,
  isLocked: true,
  viewCount: true,
  replyCount: true,
  voteCount: true,
  ticketId: true,
  lastActivityAt: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true, slug: true } },
  author: { select: AUTHOR_SELECT },
} as const;

const REPLY_SELECT = {
  id: true,
  body: true,
  moderation: true,
  isAnswer: true,
  voteCount: true,
  createdAt: true,
  updatedAt: true,
  author: { select: AUTHOR_SELECT },
} as const;

@Injectable()
export class CommunityService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrismaClient,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Categories
  // -------------------------------------------------------------------------

  listCategories(viewer: CommunityViewer) {
    return this.db.communityCategory.findMany({
      where: this.categoryFilter(viewer),
      select: CATEGORY_SELECT,
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
  }

  async createCategory(actor: AuthenticatedUser, input: CommunityCategoryInput) {
    const slug = await this.resolveCategorySlug(input.slug ?? input.name);
    const category = await this.db.communityCategory.create({
      data: {
        organizationId: actor.organizationId,
        name: input.name,
        slug,
        description: input.description ?? null,
        visibility: input.visibility,
        position: input.position,
        isActive: input.isActive,
      },
      select: CATEGORY_SELECT,
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'community.category.created',
      entity: 'CommunityCategory',
      entityId: category.id,
      newValue: { name: category.name },
    });
    return category;
  }

  async updateCategory(id: string, actor: AuthenticatedUser, input: UpdateCommunityCategoryInput) {
    const existing = await this.requireCategory(id);
    const slug =
      input.slug !== undefined && input.slug !== existing.slug
        ? await this.resolveCategorySlug(input.slug, id)
        : undefined;

    const category = await this.db.communityCategory.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(slug ? { slug } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      select: CATEGORY_SELECT,
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'community.category.updated',
      entity: 'CommunityCategory',
      entityId: id,
      newValue: { name: category.name },
    });
    return category;
  }

  async removeCategory(id: string, actor: AuthenticatedUser): Promise<void> {
    const existing = await this.requireCategory(id);
    const topics = await this.db.communityTopic.count({ where: { categoryId: id } });
    if (topics > 0) {
      throw AppError.validation(
        'Move or delete the topics in this category before deleting the category',
      );
    }

    await this.db.communityCategory.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        slug: `${existing.slug}-deleted-${Date.now().toString(36)}`.slice(0, 80),
      },
    });
    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'community.category.deleted',
      entity: 'CommunityCategory',
      entityId: id,
      oldValue: { name: existing.name },
    });
  }

  // -------------------------------------------------------------------------
  // Topics
  // -------------------------------------------------------------------------

  async listTopics(viewer: CommunityViewer, query: ListTopicsQuery): Promise<Paginated<unknown>> {
    const where: Prisma.CommunityTopicWhereInput = {
      AND: [
        this.topicFilter(viewer),
        {
          ...(query.categoryId ? { categoryId: query.categoryId } : {}),
          ...(query.type ? { type: query.type } : {}),
          ...(query.status ? { status: query.status } : {}),
          ...(query.moderation && viewer.isAgent ? { moderation: query.moderation } : {}),
          ...(query.mine && viewer.userId ? { authorId: viewer.userId } : {}),
          ...(query.unanswered ? { replies: { none: { isAnswer: true } } } : {}),
          ...(query.q
            ? {
                OR: [
                  { title: { contains: query.q, mode: 'insensitive' as const } },
                  { body: { contains: query.q, mode: 'insensitive' as const } },
                ],
              }
            : {}),
        },
      ],
    };

    const [items, total] = await Promise.all([
      this.db.communityTopic.findMany({
        where,
        select: TOPIC_SELECT,
        orderBy: [
          { isPinned: 'desc' },
          orderBy(query.sort, SORTABLE, query.order, 'lastActivityAt'),
        ],
        ...toSkipTake(query),
      }),
      this.db.communityTopic.count({ where }),
    ]);

    return { items, meta: pageMeta(query, total) };
  }

  /** Reads a topic by id or slug and counts the view in the same call. */
  async findTopic(viewer: CommunityViewer, idOrSlug: string, countView = false) {
    const topic = await this.db.communityTopic.findFirst({
      where: { AND: [this.topicFilter(viewer), { OR: [{ id: idOrSlug }, { slug: idOrSlug }] }] },
      select: TOPIC_SELECT,
    });
    if (!topic) {
      throw AppError.notFound('topic');
    }
    if (countView) {
      await this.db.communityTopic.update({
        where: { id: topic.id },
        data: { viewCount: { increment: 1 } },
      });
    }

    const replies = await this.db.communityReply.findMany({
      where: { AND: [{ topicId: topic.id }, this.moderationFilter(viewer)] },
      select: REPLY_SELECT,
      orderBy: [{ isAnswer: 'desc' }, { createdAt: 'asc' }],
    });

    const myVotes = viewer.userId
      ? await this.db.communityVote.findMany({
          where: {
            userId: viewer.userId,
            OR: [{ topicId: topic.id }, { replyId: { in: replies.map((reply) => reply.id) } }],
          },
          select: { topicId: true, replyId: true },
        })
      : [];

    return {
      ...topic,
      replies,
      votedTopic: myVotes.some((vote) => vote.topicId === topic.id),
      votedReplyIds: myVotes
        .map((vote) => vote.replyId)
        .filter((replyId): replyId is string => replyId !== null),
    };
  }

  async createTopic(
    author: AuthenticatedUser,
    input: CreateTopicInput,
    options: { moderate: boolean },
  ) {
    const viewer = this.viewerFor(author);
    const category = await this.db.communityCategory.findFirst({
      where: { AND: [{ id: input.categoryId }, this.categoryFilter(viewer)] },
      select: { id: true },
    });
    if (!category) {
      throw AppError.validation('The selected category does not exist');
    }

    const slug = await this.resolveTopicSlug(input.title);
    // Agents post straight through; customer posts wait when moderation is on.
    const moderation = options.moderate && !viewer.isAgent ? 'PENDING' : 'PUBLISHED';

    const topic = await this.db.communityTopic.create({
      data: {
        organizationId: author.organizationId,
        categoryId: input.categoryId,
        authorId: author.id,
        title: input.title,
        slug,
        body: input.body,
        type: input.type,
        moderation,
        lastActivityAt: new Date(),
      },
      select: TOPIC_SELECT,
    });

    await this.audit.record({
      organizationId: author.organizationId,
      actorId: author.id,
      action: 'community.topic.created',
      entity: 'CommunityTopic',
      entityId: topic.id,
      newValue: { title: topic.title, moderation },
    });
    return topic;
  }

  /** Author edits. Agents use `moderateTopic` for everything else. */
  async updateTopic(id: string, actor: AuthenticatedUser, input: UpdateTopicInput) {
    const viewer = this.viewerFor(actor);
    const existing = await this.requireTopic(id, viewer);
    if (!viewer.isAgent && existing.authorId !== actor.id) {
      throw AppError.forbidden('You can only edit your own topics');
    }
    if (!viewer.isAgent && existing.isLocked) {
      throw AppError.validation('This topic is locked');
    }

    const topic = await this.db.communityTopic.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.categoryId !== undefined && viewer.isAgent
          ? { categoryId: input.categoryId }
          : {}),
      },
      select: TOPIC_SELECT,
    });
    return topic;
  }

  async moderateTopic(id: string, actor: AuthenticatedUser, input: ModerateTopicInput) {
    const existing = await this.requireTopic(id, { userId: actor.id, isAgent: true });

    const topic = await this.db.communityTopic.update({
      where: { id },
      data: {
        ...(input.moderation !== undefined ? { moderation: input.moderation } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.isPinned !== undefined ? { isPinned: input.isPinned } : {}),
        ...(input.isLocked !== undefined ? { isLocked: input.isLocked } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      },
      select: TOPIC_SELECT,
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'community.topic.moderated',
      entity: 'CommunityTopic',
      entityId: id,
      oldValue: { moderation: existing.moderation, status: existing.status },
      newValue: { moderation: topic.moderation, status: topic.status },
    });
    return topic;
  }

  async removeTopic(id: string, actor: AuthenticatedUser): Promise<void> {
    const viewer = this.viewerFor(actor);
    const existing = await this.requireTopic(id, viewer);
    if (!viewer.isAgent && existing.authorId !== actor.id) {
      throw AppError.forbidden('You can only delete your own topics');
    }

    await this.db.communityTopic.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        slug: `${existing.slug}-deleted-${Date.now().toString(36)}`.slice(0, 80),
      },
    });
    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'community.topic.deleted',
      entity: 'CommunityTopic',
      entityId: id,
      oldValue: { title: existing.title },
    });
  }

  // -------------------------------------------------------------------------
  // Replies
  // -------------------------------------------------------------------------

  async createReply(
    topicId: string,
    author: AuthenticatedUser,
    input: CreateReplyInput,
    options: { moderate: boolean },
  ) {
    const viewer = this.viewerFor(author);
    const topic = await this.requireTopic(topicId, viewer);
    if (topic.isLocked && !viewer.isAgent) {
      throw AppError.validation('This topic is locked');
    }
    if (topic.moderation !== 'PUBLISHED') {
      throw AppError.validation('This topic is not published yet');
    }

    const moderation = options.moderate && !viewer.isAgent ? 'PENDING' : 'PUBLISHED';

    const reply = await this.db.$transaction(async (tx) => {
      const created = await tx.communityReply.create({
        data: {
          organizationId: author.organizationId,
          topicId,
          authorId: author.id,
          body: input.body,
          moderation,
        },
        select: REPLY_SELECT,
      });

      if (moderation === 'PUBLISHED') {
        await tx.communityTopic.update({
          where: { id: topicId },
          data: { replyCount: { increment: 1 }, lastActivityAt: new Date() },
        });
      }
      return created;
    });

    return reply;
  }

  async moderateReply(id: string, actor: AuthenticatedUser, input: ModerateReplyInput) {
    const existing = await this.db.communityReply.findFirst({
      where: { id },
      select: { id: true, topicId: true, moderation: true, isAnswer: true },
    });
    if (!existing) {
      throw AppError.notFound('reply');
    }

    const reply = await this.db.$transaction(async (tx) => {
      const updated = await tx.communityReply.update({
        where: { id },
        data: {
          ...(input.moderation !== undefined ? { moderation: input.moderation } : {}),
          ...(input.isAnswer !== undefined ? { isAnswer: input.isAnswer } : {}),
        },
        select: REPLY_SELECT,
      });

      // Approving a held reply adds it to the topic's count; rejecting takes it back off.
      const wasVisible = existing.moderation === 'PUBLISHED';
      const isVisible = updated.moderation === 'PUBLISHED';
      if (wasVisible !== isVisible) {
        await tx.communityTopic.update({
          where: { id: existing.topicId },
          data: { replyCount: { increment: isVisible ? 1 : -1 }, lastActivityAt: new Date() },
        });
      }
      if (input.isAnswer === true) {
        await tx.communityTopic.update({
          where: { id: existing.topicId },
          data: { status: 'ANSWERED' },
        });
        await tx.communityReply.updateMany({
          where: { topicId: existing.topicId, id: { not: id } },
          data: { isAnswer: false },
        });
      }
      return updated;
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'community.reply.moderated',
      entity: 'CommunityReply',
      entityId: id,
      newValue: { moderation: reply.moderation, isAnswer: reply.isAnswer },
    });
    return reply;
  }

  /** The topic's author may accept an answer on their own question. */
  async acceptAnswer(replyId: string, actor: AuthenticatedUser) {
    const reply = await this.db.communityReply.findFirst({
      where: { id: replyId },
      select: { id: true, topic: { select: { id: true, authorId: true, isLocked: true } } },
    });
    if (!reply) {
      throw AppError.notFound('reply');
    }
    if (actor.type !== 'AGENT' && reply.topic.authorId !== actor.id) {
      throw AppError.forbidden('Only the author of the topic can accept an answer');
    }
    return this.moderateReply(replyId, actor, { isAnswer: true });
  }

  async removeReply(id: string, actor: AuthenticatedUser): Promise<void> {
    const reply = await this.db.communityReply.findFirst({
      where: { id },
      select: { id: true, topicId: true, authorId: true, moderation: true },
    });
    if (!reply) {
      throw AppError.notFound('reply');
    }
    if (actor.type !== 'AGENT' && reply.authorId !== actor.id) {
      throw AppError.forbidden('You can only delete your own replies');
    }

    await this.db.$transaction(async (tx) => {
      await tx.communityReply.update({ where: { id }, data: { deletedAt: new Date() } });
      if (reply.moderation === 'PUBLISHED') {
        await tx.communityTopic.update({
          where: { id: reply.topicId },
          data: { replyCount: { decrement: 1 } },
        });
      }
    });
  }

  // -------------------------------------------------------------------------
  // Votes
  // -------------------------------------------------------------------------

  /** Upvote toggle. The counter on the parent row moves in the same transaction. */
  async toggleVote(
    actor: AuthenticatedUser,
    target: { topicId?: string; replyId?: string },
  ): Promise<{ voted: boolean; voteCount: number }> {
    const viewer = this.viewerFor(actor);
    const { topicId, replyId } = target;
    if ((topicId ? 1 : 0) + (replyId ? 1 : 0) !== 1) {
      throw AppError.validation('Vote on either a topic or a reply');
    }
    if (topicId) {
      await this.requireTopic(topicId, viewer);
    }

    const existing = await this.db.communityVote.findFirst({
      where: {
        userId: actor.id,
        ...(topicId ? { topicId } : {}),
        ...(replyId ? { replyId } : {}),
      },
      select: { id: true },
    });

    return this.db.$transaction(async (tx) => {
      if (existing) {
        await tx.communityVote.delete({ where: { id: existing.id } });
      } else {
        await tx.communityVote.create({
          data: {
            organizationId: actor.organizationId,
            userId: actor.id,
            topicId: topicId ?? null,
            replyId: replyId ?? null,
          },
        });
      }

      const delta = existing ? -1 : 1;
      if (topicId) {
        const topic = await tx.communityTopic.update({
          where: { id: topicId },
          data: { voteCount: { increment: delta } },
          select: { voteCount: true },
        });
        return { voted: !existing, voteCount: topic.voteCount };
      }

      const reply = await tx.communityReply.update({
        where: { id: replyId },
        data: { voteCount: { increment: delta } },
        select: { voteCount: true },
      });
      return { voted: !existing, voteCount: reply.voteCount };
    });
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  viewerFor(actor: AuthenticatedUser | null): CommunityViewer {
    return { userId: actor?.id ?? null, isAgent: actor?.type === 'AGENT' };
  }

  private categoryFilter(viewer: CommunityViewer): Prisma.CommunityCategoryWhereInput {
    if (viewer.isAgent) {
      return {};
    }
    return {
      isActive: true,
      visibility: { in: viewer.userId ? ['PUBLIC', 'PORTAL_USERS'] : ['PUBLIC'] },
    };
  }

  private moderationFilter(viewer: CommunityViewer): Prisma.CommunityReplyWhereInput {
    if (viewer.isAgent) {
      return {};
    }
    return {
      OR: [
        { moderation: 'PUBLISHED' },
        ...(viewer.userId ? [{ authorId: viewer.userId }] : []),
      ],
    };
  }

  private topicFilter(viewer: CommunityViewer): Prisma.CommunityTopicWhereInput {
    if (viewer.isAgent) {
      return {};
    }
    return {
      category: this.categoryFilter(viewer),
      OR: [
        { moderation: 'PUBLISHED' },
        ...(viewer.userId ? [{ authorId: viewer.userId }] : []),
      ],
    };
  }

  private async requireTopic(id: string, viewer: CommunityViewer) {
    const topic = await this.db.communityTopic.findFirst({
      where: { AND: [{ id }, this.topicFilter(viewer)] },
      select: {
        id: true,
        title: true,
        slug: true,
        authorId: true,
        isLocked: true,
        moderation: true,
        status: true,
      },
    });
    if (!topic) {
      throw AppError.notFound('topic');
    }
    return topic;
  }

  private async requireCategory(id: string) {
    const category = await this.db.communityCategory.findFirst({
      where: { id },
      select: { id: true, name: true, slug: true },
    });
    if (!category) {
      throw AppError.notFound('community category');
    }
    return category;
  }

  private resolveCategorySlug(source: string, excludeId?: string): Promise<string> {
    return uniqueSlug(
      source,
      async (candidate) => {
        const found = await this.db.communityCategory.findFirst({
          where: { slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) },
          select: { id: true },
        });
        return found !== null;
      },
      'category',
    );
  }

  private resolveTopicSlug(source: string): Promise<string> {
    return uniqueSlug(
      source,
      async (candidate) => {
        const found = await this.db.communityTopic.findFirst({
          where: { slug: candidate },
          select: { id: true },
        });
        return found !== null;
      },
      'topic',
    );
  }
}
