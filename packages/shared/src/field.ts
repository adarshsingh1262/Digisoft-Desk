import { z } from 'zod';

/**
 * Optional field that treats an empty form input as "not provided".
 *
 * Browsers submit untouched text inputs as empty strings, so without this an
 * optional email or URL field would fail validation the moment it is left blank.
 * The union keeps the *input* type a plain string, which is what a form binds to.
 */
export function optionalField<T extends z.ZodTypeAny>(schema: T) {
  return z
    .union([schema, z.literal(''), z.null()])
    .optional()
    .transform((value) => (value === '' || value === undefined ? null : value)) as z.ZodType<
    z.output<T> | null,
    z.input<T> | '' | null | undefined
  >;
}
