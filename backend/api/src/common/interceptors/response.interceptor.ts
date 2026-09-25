import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import type { ApiSuccess, PageMeta } from '@digisoft/shared';

export interface Paginated<T> {
  items: T[];
  meta: PageMeta;
}

function isPaginated<T>(value: unknown): value is Paginated<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as Paginated<T>).items) &&
    typeof (value as Paginated<T>).meta === 'object'
  );
}

/** Wraps every successful handler result in the documented API envelope. */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiSuccess<unknown>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiSuccess<unknown>> {
    return next.handle().pipe(
      map((data) =>
        isPaginated(data)
          ? { success: true as const, data: data.items, meta: data.meta }
          : { success: true as const, data: data ?? null },
      ),
    );
  }
}
