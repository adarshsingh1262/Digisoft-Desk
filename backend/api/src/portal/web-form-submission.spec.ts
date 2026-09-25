import type { WebFormField } from '@digisoft/shared';
import { readSubmission } from './web-form-submission';
import { AppError } from '../common/errors/app-error';

const field = (overrides: Partial<WebFormField>): WebFormField => ({
  key: 'field',
  label: 'Field',
  type: 'TEXT',
  required: false,
  placeholder: null,
  helpText: null,
  options: [],
  mapsTo: 'custom',
  ...overrides,
});

const FIELDS: WebFormField[] = [
  field({ key: 'name', label: 'Your name', mapsTo: 'name', required: true }),
  field({ key: 'email', label: 'Email', type: 'EMAIL', mapsTo: 'email', required: true }),
  field({ key: 'subject', label: 'Subject', mapsTo: 'subject', required: true }),
  field({ key: 'description', label: 'Details', type: 'TEXTAREA', mapsTo: 'description', required: true }),
  field({ key: 'order_id', label: 'Order number' }),
  field({ key: 'plan', label: 'Plan', type: 'SELECT', options: ['Free', 'Pro'] }),
  field({ key: 'seats', label: 'Seats', type: 'NUMBER' }),
  field({ key: 'urgent', label: 'Urgent', type: 'CHECKBOX' }),
];

describe('readSubmission', () => {
  it('sorts mapped values into ticket fields and everything else into custom fields', () => {
    const result = readSubmission(
      FIELDS,
      {
        name: ' Rhea Kapoor ',
        email: 'Rhea@Example.com',
        subject: 'Invoice will not download',
        description: 'Nothing happens in Safari.',
        order_id: 'A-1042',
        plan: 'Pro',
        seats: '12',
        urgent: true,
      },
      'Contact support',
    );

    expect(result).toEqual({
      subject: 'Invoice will not download',
      description: 'Nothing happens in Safari.',
      name: 'Rhea Kapoor',
      email: 'rhea@example.com',
      phone: null,
      customFields: { order_id: 'A-1042', plan: 'Pro', seats: 12, urgent: true },
    });
  });

  it('falls back to the form name when no field maps to the subject', () => {
    const result = readSubmission(
      [field({ key: 'description', label: 'Details', mapsTo: 'description', required: true })],
      { description: 'Something broke' },
      'Report a fault',
    );
    expect(result.subject).toBe('Report a fault');
  });

  it('reports every missing required field at once', () => {
    expect.assertions(2);
    try {
      readSubmission(FIELDS, { name: 'Rhea' }, 'Contact support');
    } catch (error) {
      const issues = (error as AppError).details as { path: string }[];
      expect(error).toBeInstanceOf(AppError);
      expect(issues.map((issue) => issue.path)).toEqual(['email', 'subject', 'description']);
    }
  });

  it('refuses a value that is not one of the options', () => {
    expect(() =>
      readSubmission(
        FIELDS,
        {
          name: 'Rhea',
          email: 'rhea@example.com',
          subject: 'Plan question',
          description: 'Body',
          plan: 'Enterprise',
        },
        'Contact support',
      ),
    ).toThrow(AppError);
  });

  it('refuses a number field that is not a number and an email that is not an address', () => {
    expect(() =>
      readSubmission(FIELDS, { name: 'R', email: 'nope', subject: 's', description: 'b' }, 'Form'),
    ).toThrow(AppError);
    expect(() =>
      readSubmission(
        FIELDS,
        { name: 'R', email: 'r@example.com', subject: 's', description: 'b', seats: 'many' },
        'Form',
      ),
    ).toThrow(AppError);
  });
});
