import {
  assignTicketSchema,
  createTicketSchema,
  updateTicketSchema,
} from '@digisoft/shared';

/**
 * PATCH payloads must only carry the fields the caller actually sent. An earlier
 * version of `optionalField` applied its transform outside `.optional()`, so parsing
 * `{ subject }` produced `{ subject, contactId: null, departmentId: null, ... }` and a
 * single-field edit silently detached the ticket from its contact and department.
 */
describe('ticket payload schemas', () => {
  describe('updateTicketSchema', () => {
    it('leaves untouched fields out of the parsed payload', () => {
      expect(updateTicketSchema.parse({})).toEqual({});
      expect(updateTicketSchema.parse({ subject: 'New subject' })).toEqual({
        subject: 'New subject',
      });
    });

    it('still lets a caller clear a field on purpose', () => {
      expect(updateTicketSchema.parse({ contactId: null })).toEqual({ contactId: null });
      expect(updateTicketSchema.parse({ contactId: '' })).toEqual({ contactId: null });
    });
  });

  describe('assignTicketSchema', () => {
    it('does not invent a department when only an agent is given', () => {
      expect(assignTicketSchema.parse({ assignedAgentId: 'agent-1' })).toEqual({
        assignedAgentId: 'agent-1',
      });
    });

    it('accepts an explicit unassignment', () => {
      expect(assignTicketSchema.parse({ assignedAgentId: null })).toEqual({
        assignedAgentId: null,
      });
    });

    it('rejects a payload that changes nothing', () => {
      expect(assignTicketSchema.safeParse({}).success).toBe(false);
    });
  });

  describe('createTicketSchema', () => {
    it('applies defaults and normalises blank optional fields to null', () => {
      expect(
        createTicketSchema.parse({ subject: 'Subject', description: 'Body', contactId: '' }),
      ).toEqual({
        subject: 'Subject',
        description: 'Body',
        contactId: null,
        source: 'AGENT',
        tagIds: [],
      });
    });

    it('requires a subject and a description', () => {
      expect(createTicketSchema.safeParse({ subject: '', description: 'x' }).success).toBe(false);
      expect(createTicketSchema.safeParse({ subject: 'x' }).success).toBe(false);
    });
  });
});
