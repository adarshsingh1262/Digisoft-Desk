import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode } from '@digisoft/shared';

/** Every deliberate failure in the application is one of these. */
export class AppError extends HttpException {
  constructor(
    readonly code: ErrorCode,
    message: string,
    status: HttpStatus,
    readonly details?: unknown,
  ) {
    super({ code, message, details }, status);
  }

  static notFound(entity: string, message?: string): AppError {
    const code = `${entity.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_NOT_FOUND` as ErrorCode;
    return new AppError(code, message ?? `${entity} not found`, HttpStatus.NOT_FOUND);
  }

  static conflict(message: string, code: ErrorCode = 'CONFLICT', details?: unknown): AppError {
    return new AppError(code, message, HttpStatus.CONFLICT, details);
  }

  static validation(message: string, details?: unknown): AppError {
    return new AppError('VALIDATION_ERROR', message, HttpStatus.BAD_REQUEST, details);
  }

  static unauthenticated(message = 'Authentication required', code: ErrorCode = 'UNAUTHENTICATED') {
    return new AppError(code, message, HttpStatus.UNAUTHORIZED);
  }

  static forbidden(message = 'You do not have access to this resource', code: ErrorCode = 'FORBIDDEN') {
    return new AppError(code, message, HttpStatus.FORBIDDEN);
  }
}
