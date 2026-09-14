import { MissingTenantContextError, scopeArgs } from '@digisoft/db';

const scoped = { organizationId: 'org-a', bypass: false };
const unscoped = { organizationId: null, bypass: true };

describe('scopeArgs (tenant isolation rules)', () => {
  describe('tenant-owned models', () => {
    it('injects organizationId into the filter of every read', () => {
      expect(scopeArgs('Contact', 'findMany', { where: { isVip: true } }, scoped).where).toEqual({
        isVip: true,
        organizationId: 'org-a',
        deletedAt: null,
      });
    });

    it('injects organizationId into a lookup by primary key', () => {
      expect(scopeArgs('Contact', 'findUnique', { where: { id: 'c1' } }, scoped).where).toEqual({
        id: 'c1',
        organizationId: 'org-a',
        deletedAt: null,
      });
    });

    it.each(['update', 'delete', 'updateMany', 'deleteMany', 'count', 'aggregate'])(
      'injects organizationId into %s',
      (operation) => {
        const result = scopeArgs('User', operation, { where: { id: 'u1' } }, scoped);
        expect((result.where as Record<string, unknown>).organizationId).toBe('org-a');
      },
    );

    it('overwrites an organizationId supplied by the caller', () => {
      const result = scopeArgs('Contact', 'findMany', { where: { organizationId: 'org-b' } }, scoped);
      expect((result.where as Record<string, unknown>).organizationId).toBe('org-a');
    });

    it('stamps organizationId onto creates, including createMany rows', () => {
      expect(scopeArgs('Contact', 'create', { data: { firstName: 'A' } }, scoped).data).toEqual({
        firstName: 'A',
        organizationId: 'org-a',
      });
      expect(
        scopeArgs('Contact', 'createMany', { data: [{ firstName: 'A' }, { firstName: 'B' }] }, scoped)
          .data,
      ).toEqual([
        { firstName: 'A', organizationId: 'org-a' },
        { firstName: 'B', organizationId: 'org-a' },
      ]);
    });

    it('stamps organizationId onto the create branch of an upsert', () => {
      const result = scopeArgs(
        'Contact',
        'upsert',
        { where: { id: 'c1' }, create: { firstName: 'A' }, update: { firstName: 'B' } },
        scoped,
      );
      expect(result.create).toEqual({ firstName: 'A', organizationId: 'org-a' });
      expect((result.where as Record<string, unknown>).organizationId).toBe('org-a');
    });

    it('fails closed when there is no tenant context at all', () => {
      expect(() => scopeArgs('Contact', 'findMany', {}, undefined)).toThrow(
        MissingTenantContextError,
      );
      expect(() =>
        scopeArgs('Contact', 'findMany', {}, { organizationId: null, bypass: false }),
      ).toThrow(MissingTenantContextError);
    });

    it('lets explicitly unscoped platform code through untouched', () => {
      expect(scopeArgs('Contact', 'findMany', { where: { id: 'c1' } }, unscoped)).toEqual({
        where: { id: 'c1' },
      });
    });
  });

  describe('soft deletes', () => {
    it('hides soft-deleted rows from reads', () => {
      expect(
        (scopeArgs('Account', 'findMany', {}, scoped).where as Record<string, unknown>).deletedAt,
      ).toBeNull();
    });

    it('respects an explicit deletedAt filter from the caller', () => {
      const result = scopeArgs('Account', 'findMany', { where: { deletedAt: { not: null } } }, scoped);
      expect((result.where as Record<string, unknown>).deletedAt).toEqual({ not: null });
    });

    it('does not filter writes, so a soft-deleted row can still be restored', () => {
      const result = scopeArgs('Account', 'update', { where: { id: 'a1' } }, scoped);
      expect((result.where as Record<string, unknown>).deletedAt).toBeUndefined();
    });
  });

  describe('non-tenant models', () => {
    it('leaves the global permission catalogue alone', () => {
      expect(scopeArgs('Permission', 'findMany', { where: { key: 'ticket.read' } }, scoped)).toEqual({
        where: { key: 'ticket.read' },
      });
    });

    it('does not require a tenant context for join tables', () => {
      expect(() => scopeArgs('UserRole', 'deleteMany', { where: { userId: 'u1' } }, undefined)).not.toThrow();
    });
  });
});
