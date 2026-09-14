import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, TenantPrismaClient } from '@digisoft/db';
import type { AuthenticatedUser, UpdateWebFormInput, WebFormInput } from '@digisoft/shared';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { AppError } from '../common/errors/app-error';
import { AuditService } from '../audit/audit.service';
import { uniqueSlug } from '../common/util/slug';

const FORM_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  fields: true,
  submitLabel: true,
  successMessage: true,
  requireLogin: true,
  isActive: true,
  submissionCount: true,
  createdAt: true,
  updatedAt: true,
  department: { select: { id: true, name: true } },
  category: { select: { id: true, name: true } },
  priority: { select: { id: true, name: true, color: true } },
} as const;

@Injectable()
export class WebFormsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrismaClient,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.db.webForm.findMany({ select: FORM_SELECT, orderBy: { name: 'asc' } });
  }

  async findById(id: string) {
    const form = await this.db.webForm.findFirst({ where: { id }, select: FORM_SELECT });
    if (!form) {
      throw AppError.notFound('web form');
    }
    return form;
  }

  async create(actor: AuthenticatedUser, input: WebFormInput) {
    await this.assertReferencesExist(input);
    const slug = await this.resolveSlug(input.slug ?? input.name);

    const form = await this.db.webForm.create({
      data: {
        organizationId: actor.organizationId,
        name: input.name,
        slug,
        description: input.description ?? null,
        departmentId: input.departmentId ?? null,
        categoryId: input.categoryId ?? null,
        priorityId: input.priorityId ?? null,
        fields: input.fields as unknown as Prisma.InputJsonValue,
        submitLabel: input.submitLabel,
        successMessage: input.successMessage,
        requireLogin: input.requireLogin,
        isActive: input.isActive,
      },
      select: FORM_SELECT,
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'web_form.created',
      entity: 'WebForm',
      entityId: form.id,
      newValue: { name: form.name, slug: form.slug },
    });
    return form;
  }

  async update(id: string, actor: AuthenticatedUser, input: UpdateWebFormInput) {
    const existing = await this.require(id);
    await this.assertReferencesExist(input);

    const slug =
      input.slug !== undefined && input.slug !== existing.slug
        ? await this.resolveSlug(input.slug, id)
        : undefined;

    const form = await this.db.webForm.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(slug ? { slug } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.departmentId !== undefined ? { departmentId: input.departmentId } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.priorityId !== undefined ? { priorityId: input.priorityId } : {}),
        ...(input.fields !== undefined
          ? { fields: input.fields as unknown as Prisma.InputJsonValue }
          : {}),
        ...(input.submitLabel !== undefined ? { submitLabel: input.submitLabel } : {}),
        ...(input.successMessage !== undefined ? { successMessage: input.successMessage } : {}),
        ...(input.requireLogin !== undefined ? { requireLogin: input.requireLogin } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      select: FORM_SELECT,
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'web_form.updated',
      entity: 'WebForm',
      entityId: id,
      oldValue: { name: existing.name },
      newValue: { name: form.name },
    });
    return form;
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<void> {
    const existing = await this.require(id);
    await this.db.webForm.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        slug: `${existing.slug}-deleted-${Date.now().toString(36)}`.slice(0, 80),
      },
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'web_form.deleted',
      entity: 'WebForm',
      entityId: id,
      oldValue: { name: existing.name },
    });
  }

  private async require(id: string) {
    const form = await this.db.webForm.findFirst({
      where: { id },
      select: { id: true, name: true, slug: true },
    });
    if (!form) {
      throw AppError.notFound('web form');
    }
    return form;
  }

  private async assertReferencesExist(input: UpdateWebFormInput): Promise<void> {
    if (input.departmentId) {
      const department = await this.db.department.findFirst({
        where: { id: input.departmentId },
        select: { id: true },
      });
      if (!department) throw AppError.validation('The selected department does not exist');
    }
    if (input.categoryId) {
      const category = await this.db.ticketCategory.findFirst({
        where: { id: input.categoryId },
        select: { id: true },
      });
      if (!category) throw AppError.validation('The selected category does not exist');
    }
    if (input.priorityId) {
      const priority = await this.db.ticketPriority.findFirst({
        where: { id: input.priorityId },
        select: { id: true },
      });
      if (!priority) throw AppError.validation('The selected priority does not exist');
    }
  }

  private resolveSlug(source: string, excludeId?: string): Promise<string> {
    return uniqueSlug(
      source,
      async (candidate) => {
        const found = await this.db.webForm.findFirst({
          where: { slug: candidate, ...(excludeId ? { id: { not: excludeId } } : {}) },
          select: { id: true },
        });
        return found !== null;
      },
      'form',
    );
  }
}
