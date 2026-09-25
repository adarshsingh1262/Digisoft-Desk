import type { ConditionLeaf, ConditionTree } from '@digisoft/shared';

/** The slice of a ticket the rule DSL can inspect. */
export interface TicketFacts {
  statusId: string;
  priorityId: string;
  priorityWeight: number;
  departmentId: string | null;
  categoryId: string | null;
  assignedAgentId: string | null;
  contactId: string | null;
  accountId: string | null;
  source: string;
  tagIds: string[];
  subject: string;
  description: string;
  contactIsVip: boolean;
}

type Scalar = string | number | boolean | null;

function readField(facts: TicketFacts, field: ConditionLeaf['field']): Scalar | string[] {
  switch (field) {
    case 'isAssigned':
      return facts.assignedAgentId !== null;
    default:
      return facts[field];
  }
}

function asArray(value: ConditionLeaf['value']): string[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [String(value)];
}

export function evaluateLeaf(facts: TicketFacts, leaf: ConditionLeaf): boolean {
  const actual = readField(facts, leaf.field);
  const expected = leaf.value;

  switch (leaf.op) {
    case 'is_empty':
      return Array.isArray(actual) ? actual.length === 0 : actual === null || actual === '';
    case 'is_not_empty':
      return Array.isArray(actual) ? actual.length > 0 : actual !== null && actual !== '';
    case 'eq':
      return Array.isArray(actual) ? false : actual === expected;
    case 'neq':
      return Array.isArray(actual) ? true : actual !== expected;
    case 'in':
      return Array.isArray(actual)
        ? actual.some((item) => asArray(expected).includes(item))
        : asArray(expected).includes(String(actual));
    case 'not_in':
      return Array.isArray(actual)
        ? !actual.some((item) => asArray(expected).includes(item))
        : !asArray(expected).includes(String(actual));
    case 'contains':
      return Array.isArray(actual)
        ? asArray(expected).every((item) => actual.includes(item))
        : typeof actual === 'string' &&
            typeof expected === 'string' &&
            actual.toLowerCase().includes(expected.toLowerCase());
    case 'not_contains':
      return Array.isArray(actual)
        ? !asArray(expected).some((item) => actual.includes(item))
        : !(
            typeof actual === 'string' &&
            typeof expected === 'string' &&
            actual.toLowerCase().includes(expected.toLowerCase())
          );
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      if (typeof actual !== 'number' || typeof expected !== 'number') return false;
      if (leaf.op === 'gt') return actual > expected;
      if (leaf.op === 'gte') return actual >= expected;
      if (leaf.op === 'lt') return actual < expected;
      return actual <= expected;
    }
    default:
      return false;
  }
}

/** Empty trees match everything: `all` of nothing is true and `any` of nothing is skipped. */
export function evaluateConditions(facts: TicketFacts, tree: ConditionTree | null | undefined): boolean {
  const all = tree?.all ?? [];
  const any = tree?.any ?? [];
  const allPass = all.every((leaf) => evaluateLeaf(facts, leaf));
  const anyPass = any.length === 0 || any.some((leaf) => evaluateLeaf(facts, leaf));
  return allPass && anyPass;
}
