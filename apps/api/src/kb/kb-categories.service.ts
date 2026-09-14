import { Inject, Injectable } from '@nestjs/common';
import type { TenantPrismaClient } from '@digisoft/db';
import type {
  AuthenticatedUser,
  KbCategoryInput,
  UpdateKbCategoryInput,
} from '@digisoft/shared';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { AppError } from '../common/errors/app-error';
import { AuditService } from '../audit/audit.service';
import { uniqueSlug } from '../common/util/slug';

const CATEGORY_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  icon: true,
  parentId: true,
  visibility: true,
  position: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { articles: true } },
} as const;

@Injectable()
export class KbCategoriesService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrismaClient,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.db.kbCategory.findMany({
      select: CATEGORY_SELECT,
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
  }

  async create(actor: AuthenticatedUser, input: KbCategoryInput) {
    await this.assertParentExists(input.parentId ?? null, null);
    const slug = await this.resolveSlug(input.slug ?? input.name);

    const category = await this.db.kbCategory.create({
      data: {
        organizationId: actor.organizationId,
        name: input.name,
        slug,
        description: input.description ?? null,
        icon: input.icon ?? null,
        parentId: input.parentId ?? null,
        visibility: input.visibility,
        position: input.position,
        isActive: input.isActive,
      },
      select: CATEGORY_SELECT,
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'kb.category.created',
      entity: 'KbCategory',
      entityId: category.id,
      newValue: { name: category.name, slug: category.slug },
    });
    return category;
  }

  async update(id: string, actor: AuthenticatedUser, input: UpdateKbCategoryInput) {
    const existing = await this.require(id);
    if (input.parentId !== undefined) {
      await this.assertParentExists(input.parentId ?? null, id);
    }

    const slug =
      input.slug !== undefined && input.slug !== existing.slug
        ? await this.resolveSlug(input.slug, id)
        : undefined;

    const category = await this.db.kbCategory.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(slug ? { slug } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.icon !== undefined ? { icon: input.icon } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      select: CATEGORY_SELECT,
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'kb.category.updated',
      entity: 'KbCategory',
      entityId: id,
      oldValue: { name: existing.name },
      newValue: { name: category.name },
    });
    return category;
  }

  /**
   * Soft delete. Articles stay, detached from the category rather than deleted with it,
   * and the slug is released so the same address can be used again.
   */
  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    const existing = await this.require(id);
    await this.db.$transaction(async (tx) => {
      await tx.kbArticle.updateMany({ where: { categoryId: id }, data: { categoryId: null } });
      await tx.kbCategory.updateMany({ where: { parentId: id }, data: { parentId: null } });
      await tx.kbCategory.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          slug: `${existing.slug}-deleted-${Date.now().toString(36)}`.slice(0, 80),
        },
      });
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'kb.category.deleted',
      entity: 'KbCategory',
      entityId: id,
    });
  }

  private async require(id: string) {
    const category = await this.db.kbCategory.findFirst({
      where: { id },
      select: { id: true, name: true, slug: true },
    });
    if (!category) {
      throw AppError.notFound('knowledge base category');
    }
    return category;
  }

  private async assertParentExists(parentId: string | null, selfId: string | null): Promise<void> {
    if (!parentId) {
      return;
    }
    if (parentId === selfId) {
      throw AppError.validation('A category cannot be its own parent');
    }
    const parent = await this.db.kbCategory.findFirst({
      where: { id: parentId },
      select: { id: true, parentId: true },
    });
    if (!parent) {
      throw AppError.validation('The parent category does not exist');
    }
    if (selfId && parent.parentId === selfId) {
      throw AppError.validation('That would create a loop between the two categories');
    }
  }

  private resolveSlug(source: string, excludeId?: string): Promise<string> {
    return uniqueSlug(
      source,
      async (candidate) => {
        const found = await this.db.kbCategory.findFirst({
          where: { slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) },
          select: { id: true },
        });
        return found !== null;
      },
      'category',
    );
  }
}
