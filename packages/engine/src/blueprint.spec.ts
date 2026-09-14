import { checkTransition, missingRequiredFields, type TransitionOption } from './blueprint';

const ticket = {
  resolutionNote: null,
  assignedAgentId: 'agent-1',
  departmentId: null,
  categoryId: 'cat-1',
  contactId: 'c-1',
  tags: [] as { tagId: string }[],
};

const toResolved: TransitionOption = {
  transitionId: 't1',
  name: 'Resolve',
  toStatusId: 's-resolved',
  requiredFields: ['resolutionNote', 'assignedAgentId'],
  allowedRoleIds: [],
  actions: [],
};

const toClosedAdminsOnly: TransitionOption = {
  transitionId: 't2',
  name: 'Close',
  toStatusId: 's-closed',
  requiredFields: [],
  allowedRoleIds: ['role-admin'],
  actions: [],
};

describe('missingRequiredFields', () => {
  it('counts a value supplied with the request as present', () => {
    expect(missingRequiredFields(ticket, ['resolutionNote', 'assignedAgentId'], {})).toEqual(['resolutionNote']);
    expect(missingRequiredFields(ticket, ['resolutionNote'], { resolutionNote: 'Fixed' })).toEqual([]);
  });

  it('treats an empty tag set as missing', () => {
    expect(missingRequiredFields(ticket, ['tags', 'departmentId'], {})).toEqual(['tags', 'departmentId']);
  });
});

describe('checkTransition', () => {
  const options = [toResolved, toClosedAdminsOnly];

  it('refuses a status the workflow does not reach', () => {
    const result = checkTransition(options, ticket, 's-on-hold', ['role-agent'], {});
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not reachable/);
  });

  it('refuses a transition reserved for another role', () => {
    expect(checkTransition(options, ticket, 's-closed', ['role-agent'], {}).reason).toMatch(/role/);
    expect(checkTransition(options, ticket, 's-closed', ['role-admin'], {}).ok).toBe(true);
  });

  it('names the fields still missing', () => {
    const result = checkTransition(options, ticket, 's-resolved', ['role-agent'], {});
    expect(result.ok).toBe(false);
    expect(result.missingFields).toEqual(['resolutionNote']);
  });

  it('passes once the required fields are satisfied', () => {
    const result = checkTransition(options, ticket, 's-resolved', ['role-agent'], { resolutionNote: 'Done' });
    expect(result.ok).toBe(true);
    expect(result.transition?.transitionId).toBe('t1');
  });
});
