import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantStore {
  /** Organization the current execution context is allowed to touch. */
  organizationId: string | null;
  /**
   * Platform-level escape hatch. Only set by code that must run before a tenant
   * is known (login lookup, organization creation, webhook ingestion, migrations).
   */
  bypass: boolean;
}

const storage = new AsyncLocalStorage<TenantStore>();

export class MissingTenantContextError extends Error {
  constructor(model: string, operation: string) {
    super(
      `Refusing to run ${model}.${operation} without a tenant context. ` +
        `Wrap the call in TenantContext.run(organizationId, ...) or, for platform-level ` +
        `operations, TenantContext.runUnscoped(...).`,
    );
    this.name = 'MissingTenantContextError';
  }
}

export const TenantContext = {
  /** Run `fn` scoped to a single organization. */
  run<T>(organizationId: string, fn: () => T): T {
    return storage.run({ organizationId, bypass: false }, fn);
  },

  /** Run `fn` with tenant scoping disabled. Keep the body as small as possible. */
  runUnscoped<T>(fn: () => T): T {
    return storage.run({ organizationId: null, bypass: true }, fn);
  },

  get store(): TenantStore | undefined {
    return storage.getStore();
  },

  get organizationId(): string | null {
    return storage.getStore()?.organizationId ?? null;
  },

  /** Organization id, or throw — for services that must never run unscoped. */
  requireOrganizationId(): string {
    const id = storage.getStore()?.organizationId;
    if (!id) {
      throw new MissingTenantContextError('unknown', 'requireOrganizationId');
    }
    return id;
  },
};
