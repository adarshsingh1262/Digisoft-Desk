import { z } from 'zod';

/**
 * Optional field that treats an empty form input as "not provided".
 *
 * Browsers submit untouched text inputs as empty strings, so without this an optional
 * email or URL field would fail validation the moment it is left blank.
 *
 * The `.optional()` wraps the transform rather than the other way round, which matters
 * for PATCH semantics: a key the client did not send stays `undefined` so the service
 * leaves that column alone, while an explicit `null` or `''` clears it. With the
 * wrapping reversed, sending `{ subject }` would quietly null every other field.
 */
export function optionalField<T extends z.ZodTypeAny>(schema: T) {
  return z
    .union([schema, z.literal(''), z.null()])
    .transform((value): z.output<T> | null => (value === '' ? null : (value as z.output<T>)))
    .optional();
}
