import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, TenantPrismaClient } from '@digisoft/db';
import type {
  AuthenticatedUser,
  KbArticleInput,
  ListKbArticlesQuery,
  UpdateKbArticleInput,
} from '@digisoft/shared';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { AppError } from '../common/errors/app-error';
import { AuditService } from '../audit/audit.service';
import { orderBy, pageMeta, toSkipTake } from '../common/dto/pagination';
import type { Paginated } from '../common/interceptors/response.interceptor';
import { uniqueSlug } from '../common/util/slug';

const SORTABLE = ['createdAt', 'updatedAt', 'title', 'publishedAt', 'viewCount', 'position'] as const;

const AUTHOR_SELECT = { id: true, firstName: true, lastName: true } as const;

const LIST_SELECT = {
  id: true,
  title: true,
  slug: true,
  summary: true,
  status: true,
  visibility: true,
  position: true,
  publishedAt: true,
  viewCount: true,
  helpfulCount: true,
  notHelpfulCount: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true, slug: true } },
  author: { select: AUTHOR_SELECT },
} as const;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  body: true,
  keywords: true,
  seoTitle: true,
  seoDescription: true,
} as const;

@Injectable()
export class KbArticlesService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrismaClient,
    private readonly audit: AuditService,
  ) {}

  async list(actor: AuthenticatedUser, query: ListKbArticlesQuery): Promise<Paginated<unknown>> {
    const where: Prisma.KbArticleWhereInput = {
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.visibility ? { visibility: query.visibility } : {}),
      ...(query.authorId ? { authorId: query.authorId } : {}),
      ...(query.mine ? { authorId: actor.id } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' as const } },
              { summary: { contains: query.q, mode: 'insensitive' as const } },
              { body: { contains: query.q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.db.kbArticle.findMany({
        where,
        select: LIST_SELECT,
        orderBy: orderBy(query.sort, SORTABLE, query.order, 'updatedAt'),
        ...toSkipTake(query),
      }),
      this.db.kbArticle.count({ where }),
    ]);

    return { items, meta: pageMeta(query, total) };
  }

  async findById(id: string) {
    const article = await this.db.kbArticle.findFirst({ where: { id }, select: DETAIL_SELECT });
    if (!article) {
      throw AppError.notFound('article');
    }
    return article;
  }

  async create(actor: AuthenticatedUser, input: KbArticleInput) {
    await this.assertCategoryExists(input.categoryId ?? null);
    const slug = await this.resolveSlug(input.slug ?? input.title);
    const published = input.status === 'PUBLISHED';

    const article = await this.db.kbArticle.create({
      data: {
        organizationId: actor.organizationId,
        title: input.title,
        slug,
        summary: input.summary ?? null,
        body: input.body,
        categoryId: input.categoryId ?? null,
        status: input.status,
        visibility: input.visibility,
        keywords: input.keywords,
        seoTitle: input.seoTitle ?? null,
        seoDescription: input.seoDescription ?? null,
        position: input.position,
        authorId: actor.id,
        publishedAt: published ? new Date() : null,
      },
      select: DETAIL_SELECT,
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'kb.article.created',
      entity: 'KbArticle',
      entityId: article.id,
      newValue: { title: article.title, status: article.status },
    });
    return article;
  }

  async update(id: string, actor: AuthenticatedUser, input: UpdateKbArticleInput) {
    const existing = await this.require(id);
    if (input.categoryId !== undefined) {
      await this.assertCategoryExists(input.categoryId ?? null);
    }

    const slug =
      input.slug !== undefined && input.slug !== existing.slug
        ? await this.resolveSlug(input.slug, id)
        : undefined;

    // Publishing stamps the date once; later edits keep the original publication time.
    const publishedAt =
      input.status === 'PUBLISHED' && !existing.publishedAt
        ? new Date()
        : input.status === 'DRAFT'
          ? null
          : undefined;

    const article = await this.db.kbArticle.update({
      where: { id },
      data: {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(slug ? { slug } : {}),
        ...(input.summary !== undefined ? { summary: input.summary } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
        ...(input.keywords !== undefined ? { keywords: input.keywords } : {}),
        ...(input.seoTitle !== undefined ? { seoTitle: input.seoTitle } : {}),
        ...(input.seoDescription !== undefined ? { seoDescription: input.seoDescription } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
        ...(publishedAt !== undefined ? { publishedAt } : {}),
      },
      select: DETAIL_SELECT,
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'kb.article.updated',
      entity: 'KbArticle',
      entityId: id,
      oldValue: { title: existing.title, status: existing.status },
      newValue: { title: article.title, status: article.status },
    });
    return article;
  }

  /** Status shortcut used by the publish/unpublish buttons in the agent UI. */
  setStatus(id: string, actor: AuthenticatedUser, status: 'PUBLISHED' | 'DRAFT' | 'ARCHIVED') {
    return this.update(id, actor, { status });
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    const existing = await this.require(id);
    await this.db.kbArticle.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        slug: `${existing.slug}-deleted-${Date.now().toString(36)}`.slice(0, 80),
      },
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'kb.article.deleted',
      entity: 'KbArticle',
      entityId: id,
      oldValue: { title: existing.title },
    });
  }

  listFeedback(articleId: string) {
    return this.db.kbArticleFeedback.findMany({
      where: { articleId },
      select: {
        id: true,
        isHelpful: true,
        comment: true,
        createdAt: true,
        user: { select: AUTHOR_SELECT },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  private async require(id: string) {
    const article = await this.db.kbArticle.findFirst({
      where: { id },
      select: { id: true, title: true, slug: true, status: true, publishedAt: true },
    });
    if (!article) {
      throw AppError.notFound('article');
    }
    return article;
  }

  private async assertCategoryExists(categoryId: string | null): Promise<void> {
    if (!categoryId) {
      return;
    }
    const category = await this.db.kbCategory.findFirst({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!category) {
      throw AppError.validation('The selected category does not exist');
    }
  }

  private resolveSlug(source: string, excludeId?: string): Promise<string> {
    return uniqueSlug(
      source,
      async (candidate) => {
        const found = await this.db.kbArticle.findFirst({
          where: { slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) },
          select: { id: true },
        });
        return found !== null;
      },
      'article',
    );
  }
}
