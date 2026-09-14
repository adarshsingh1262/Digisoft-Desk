import { PERMISSIONS, type AuthenticatedUser } from '@digisoft/shared';
import { ticketVisibilityFilter, canReadInternalNotes } from './ticket-visibility';

const baseUser: AuthenticatedUser = {
  id: 'user-1',
  organizationId: 'org-1',
  email: 'agent@example.test',
  firstName: 'Ash',
  lastName: 'Agent',
  type: 'AGENT',
  roles: ['AGENT'],
  permissions: [PERMISSIONS.TICKET_READ],
  departmentIds: [],
};

describe('ticketVisibilityFilter', () => {
  it('imposes no extra filter on a user who may read every ticket', () => {
    expect(
      ticketVisibilityFilter({
        ...baseUser,
        permissions: [PERMISSIONS.TICKET_READ, PERMISSIONS.TICKET_READ_ALL],
      }),
    ).toEqual({});
  });

  it('narrows to assignment, authorship and follows when the user has no departments', () => {
    expect(ticketVisibilityFilter(baseUser)).toEqual({
      OR: [
        { assignedAgentId: 'user-1' },
        { createdById: 'user-1' },
        { followers: { some: { userId: 'user-1' } } },
      ],
    });
  });

  it('adds the department queues the user belongs to', () => {
    const filter = ticketVisibilityFilter({ ...baseUser, departmentIds: ['dept-1', 'dept-2'] });
    expect(filter.OR).toContainEqual({ departmentId: { in: ['dept-1', 'dept-2'] } });
    expect(filter.OR).toHaveLength(4);
  });
});

describe('canReadInternalNotes', () => {
  it('allows agents and refuses customers', () => {
    expect(canReadInternalNotes(baseUser)).toBe(true);
    expect(canReadInternalNotes({ ...baseUser, type: 'CUSTOMER' })).toBe(false);
  });
});
