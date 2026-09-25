import { evaluateConditions, type TicketFacts } from './conditions';

const facts: TicketFacts = {
  statusId: 's-new',
  priorityId: 'p-high',
  priorityWeight: 30,
  departmentId: 'd-support',
  categoryId: null,
  assignedAgentId: null,
  contactId: 'c-1',
  accountId: null,
  source: 'EMAIL',
  tagIds: ['t-login', 't-vip'],
  subject: 'Cannot sign in to the portal',
  description: 'Password reset loops.',
  contactIsVip: true,
};

describe('evaluateConditions', () => {
  it('matches everything when the tree is empty', () => {
    expect(evaluateConditions(facts, { all: [], any: [] })).toBe(true);
    expect(evaluateConditions(facts, null)).toBe(true);
  });

  it('requires every `all` leaf and at least one `any` leaf', () => {
    expect(
      evaluateConditions(facts, {
        all: [{ field: 'priorityId', op: 'eq', value: 'p-high' }],
        any: [
          { field: 'source', op: 'eq', value: 'CHAT' },
          { field: 'source', op: 'eq', value: 'EMAIL' },
        ],
      }),
    ).toBe(true);
    expect(
      evaluateConditions(facts, {
        all: [{ field: 'priorityId', op: 'eq', value: 'p-low' }],
        any: [],
      }),
    ).toBe(false);
    expect(
      evaluateConditions(facts, {
        all: [],
        any: [{ field: 'source', op: 'eq', value: 'CHAT' }],
      }),
    ).toBe(false);
  });

  it('handles membership operators on scalars and lists', () => {
    expect(evaluateConditions(facts, { all: [{ field: 'source', op: 'in', value: ['EMAIL', 'CHAT'] }], any: [] })).toBe(true);
    expect(evaluateConditions(facts, { all: [{ field: 'tagIds', op: 'contains', value: ['t-login'] }], any: [] })).toBe(true);
    expect(evaluateConditions(facts, { all: [{ field: 'tagIds', op: 'contains', value: ['t-login', 't-missing'] }], any: [] })).toBe(false);
    expect(evaluateConditions(facts, { all: [{ field: 'tagIds', op: 'not_contains', value: ['t-missing'] }], any: [] })).toBe(true);
    expect(evaluateConditions(facts, { all: [{ field: 'departmentId', op: 'not_in', value: ['d-billing'] }], any: [] })).toBe(true);
  });

  it('handles emptiness, text search and numeric comparisons', () => {
    expect(evaluateConditions(facts, { all: [{ field: 'categoryId', op: 'is_empty' }], any: [] })).toBe(true);
    expect(evaluateConditions(facts, { all: [{ field: 'isAssigned', op: 'eq', value: false }], any: [] })).toBe(true);
    expect(evaluateConditions(facts, { all: [{ field: 'subject', op: 'contains', value: 'SIGN IN' }], any: [] })).toBe(true);
    expect(evaluateConditions(facts, { all: [{ field: 'priorityWeight', op: 'gte', value: 30 }], any: [] })).toBe(true);
    expect(evaluateConditions(facts, { all: [{ field: 'priorityWeight', op: 'gt', value: 30 }], any: [] })).toBe(false);
    expect(evaluateConditions(facts, { all: [{ field: 'contactIsVip', op: 'eq', value: true }], any: [] })).toBe(true);
  });
});
