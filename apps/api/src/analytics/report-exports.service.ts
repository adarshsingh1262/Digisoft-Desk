import { Inject, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { STORAGE_PROVIDER, type StorageProvider } from '@digisoft/storage';
import type { TenantPrismaClient } from '@digisoft/db';
import type { AuthenticatedUser, ReportExportInput } from '@digisoft/shared';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import { ANALYTICS_QUEUE_TOKEN } from '../queue/queue.module';
import { REPORT_EXPORT_JOB, type ReportExportJob } from '../queue/queue.constants';
import { AppError } from '../common/errors/app-error';

const SELECT = {
  id: true,
  kind: true,
  filters: true,
  status: true,
  fileName: true,
  rowCount: true,
  sizeBytes: true,
  error: true,
  createdAt: true,
  completedAt: true,
  requestedBy: { select: { id: true, firstName: true, lastName: true } },
} as const;

/**
 * An export is a row first and a file second: the request returns immediately, the
 * worker renders the CSV and writes it to the same storage attachments use, and the
 * download is re-authorised every time.
 */
@Injectable()
export class ReportExportsService {
  constructor(
    @Inject(TENANT_PRISMA) private readonly db: TenantPrismaClient,
    @Inject(ANALYTICS_QUEUE_TOKEN) private readonly queue: Queue<ReportExportJob>,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  list() {
    return this.db.reportExport.findMany({
      select: SELECT,
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
  }

  async create(actor: AuthenticatedUser, input: ReportExportInput) {
    const created = await this.db.reportExport.create({
      data: {
        organizationId: actor.organizationId,
        kind: input.kind,
        filters: input.filters,
        requestedById: actor.id,
      },
      select: SELECT,
    });

    await this.queue.add(REPORT_EXPORT_JOB, {
      organizationId: actor.organizationId,
      exportId: created.id,
    });
    return created;
  }

  async get(id: string) {
    const record = await this.db.reportExport.findFirst({ where: { id }, select: SELECT });
    if (!record) throw AppError.notFound('Export not found');
    return record;
  }

  /** Re-reads the row inside the tenant scope, so one organization cannot fetch another's file. */
  async download(id: string) {
    const record = await this.db.reportExport.findFirst({
      where: { id },
      select: { id: true, status: true, storageKey: true, fileName: true, error: true },
    });
    if (!record) throw AppError.notFound('Export not found');
    if (record.status === 'FAILED') {
      throw AppError.validation(record.error ?? 'The export failed');
    }
    if (record.status !== 'READY' || !record.storageKey) {
      throw AppError.validation('The export is still being prepared');
    }

    const fileName = record.fileName ?? 'report.csv';
    const target = await this.storage.download(record.storageKey, fileName, 'text/csv');
    return { target, fileName };
  }
}
