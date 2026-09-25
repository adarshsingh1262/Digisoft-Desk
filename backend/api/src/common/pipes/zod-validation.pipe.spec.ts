import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';
import { AppError } from '../errors/app-error';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(
    z.object({ email: z.string().email(), age: z.coerce.number().int().min(0) }),
  );

  it('returns the parsed and coerced value', () => {
    expect(pipe.transform({ email: 'a@b.com', age: '42' })).toEqual({
      email: 'a@b.com',
      age: 42,
    });
  });

  it('raises a VALIDATION_ERROR listing each offending path', () => {
    try {
      pipe.transform({ email: 'nope', age: -1 });
      fail('expected the pipe to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.code).toBe('VALIDATION_ERROR');
      const details = (appError.getResponse() as { details: { path: string }[] }).details;
      expect(details.map((d) => d.path).sort()).toEqual(['age', 'email']);
    }
  });
});
