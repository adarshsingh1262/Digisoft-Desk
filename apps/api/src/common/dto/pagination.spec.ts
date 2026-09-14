import { orderBy, pageMeta, toSkipTake } from './pagination';

describe('pagination helpers', () => {
  it('converts a page request to skip/take', () => {
    expect(toSkipTake({ page: 1, pageSize: 25 })).toEqual({ skip: 0, take: 25 });
    expect(toSkipTake({ page: 3, pageSize: 10 })).toEqual({ skip: 20, take: 10 });
  });

  it('computes page metadata, never reporting fewer than one page', () => {
    expect(pageMeta({ page: 1, pageSize: 25 }, 0)).toEqual({
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 1,
    });
    expect(pageMeta({ page: 2, pageSize: 25 }, 51).totalPages).toBe(3);
  });

  describe('orderBy', () => {
    const allowed = ['createdAt', 'name'] as const;

    it('uses the requested field when it is whitelisted', () => {
      expect(orderBy('name', allowed, 'asc', 'createdAt')).toEqual({ name: 'asc' });
    });

    it('falls back for anything not whitelisted, so no arbitrary column can be sorted', () => {
      expect(orderBy('passwordHash', allowed, 'desc', 'createdAt')).toEqual({ createdAt: 'desc' });
      expect(orderBy(undefined, allowed, 'desc', 'createdAt')).toEqual({ createdAt: 'desc' });
      expect(orderBy('name); drop table users;--', allowed, 'asc', 'createdAt')).toEqual({
        createdAt: 'asc',
      });
    });
  });
});
