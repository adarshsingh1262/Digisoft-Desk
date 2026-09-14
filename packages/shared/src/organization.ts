import { z } from 'zod';
import { optionalField } from './field';

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  logoUrl: optionalField(z.string().url().max(500)),
  domain: optionalField(z.string().trim().max(255)),
  timezone: z.string().trim().min(1).max(64).optional(),
  locale: z.string().trim().min(2).max(10).optional(),
  currency: z.string().trim().length(3).optional(),
});
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type OrganizationFormValues = z.input<typeof updateOrganizationSchema>;

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm');

export const weeklyScheduleSchema = z
  .array(
    z.object({
      /** 0 = Sunday .. 6 = Saturday */
      day: z.number().int().min(0).max(6),
      start: timeOfDay,
      end: timeOfDay,
    }),
  )
  .max(14)
  .refine(
    (days) => days.every((d) => d.start < d.end),
    'Each working window must start before it ends',
  );

export const businessHoursSchema = z.object({
  name: z.string().trim().min(1).max(80),
  timezone: z.string().trim().min(1).max(64),
  isDefault: z.boolean().default(false),
  weeklySchedule: weeklyScheduleSchema,
});
export type BusinessHoursInput = z.infer<typeof businessHoursSchema>;

export const holidaySchema = z.object({
  name: z.string().trim().min(1).max(120),
  date: z.coerce.date(),
});
export type HolidayInput = z.infer<typeof holidaySchema>;
