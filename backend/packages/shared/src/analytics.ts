import { z } from 'zod';
import { optionalField } from './field';

export const REPORT_KINDS = ['TICKETS', 'AGENTS', 'SLA', 'CSAT'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const EXPORT_STATUSES = ['QUEUED', 'READY', 'FAILED'] as const;
export type ExportStatus = (typeof EXPORT_STATUSES)[number];

export const CSAT_STATUSES = ['PENDING', 'ANSWERED', 'EXPIRED'] as const;
export type CsatStatus = (typeof CSAT_STATUSES)[number];

/**
 * Named ranges the UI offers. `custom` is the escape hatch and requires `from`/`to`;
 * everything else is resolved on the server so two clients in different timezones
 * cannot disagree about what "last 7 days" means.
 */
export const REPORT_RANGES = ['today', '7d', '30d', '90d', 'custom'] as const;
export type ReportRange = (typeof REPORT_RANGES)[number];

export const REPORT_GROUPINGS = ['day', 'department', 'agent', 'priority', 'status', 'channel'] as const;
export type ReportGrouping = (typeof REPORT_GROUPINGS)[number];

const isoDate = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Expected an ISO date');

export const analyticsQuerySchema = z
  .object({
    range: z.enum(REPORT_RANGES).default('30d'),
    from: isoDate.optional(),
    to: isoDate.optional(),
    departmentId: z.string().min(1).optional(),
    agentId: z.string().min(1).optional(),
    priorityId: z.string().min(1).optional(),
    channelId: z.string().min(1).optional(),
    groupBy: z.enum(REPORT_GROUPINGS).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.range !== 'custom') return;
    if (!value.from || !value.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A custom range needs both from and to',
        path: ['from'],
      });
      return;
    }
    if (Date.parse(value.from) > Date.parse(value.to)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'from must not be after to',
        path: ['from'],
      });
    }
  });
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

export const reportDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(REPORT_KINDS),
  description: optionalField(z.string().trim().max(500)),
  filters: analyticsQuerySchema,
});
export type ReportDefinitionInput = z.infer<typeof reportDefinitionSchema>;
export type ReportDefinitionFormValues = z.input<typeof reportDefinitionSchema>;

export const updateReportDefinitionSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  kind: z.enum(REPORT_KINDS).optional(),
  description: optionalField(z.string().trim().max(500)),
  filters: analyticsQuerySchema.optional(),
});
export type UpdateReportDefinitionInput = z.infer<typeof updateReportDefinitionSchema>;

export const reportExportSchema = z.object({
  kind: z.enum(REPORT_KINDS),
  filters: analyticsQuerySchema,
});
export type ReportExportInput = z.infer<typeof reportExportSchema>;
/** What a caller may send — every `analyticsQuerySchema` field with a default is optional. */
export type ReportExportFormValues = z.input<typeof reportExportSchema>;

export const csatSettingsSchema = z.object({
  isEnabled: z.boolean().optional(),
  delayMinutes: z.coerce.number().int().min(0).max(10_080).optional(),
  expiryDays: z.coerce.number().int().min(1).max(90).optional(),
  subject: z.string().trim().min(1).max(200).optional(),
  introText: z.string().trim().min(1).max(1000).optional(),
  thankYouText: z.string().trim().min(1).max(1000).optional(),
});
export type CsatSettingsInput = z.infer<typeof csatSettingsSchema>;
export type CsatSettingsFormValues = z.input<typeof csatSettingsSchema>;

export const CSAT_MIN_RATING = 1;
export const CSAT_MAX_RATING = 5;

export const csatSubmitSchema = z.object({
  rating: z.coerce.number().int().min(CSAT_MIN_RATING).max(CSAT_MAX_RATING),
  comment: optionalField(z.string().trim().max(2000)),
});
export type CsatSubmitInput = z.infer<typeof csatSubmitSchema>;
export type CsatSubmitFormValues = z.input<typeof csatSubmitSchema>;
