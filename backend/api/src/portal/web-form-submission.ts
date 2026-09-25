import type { WebFormField } from '@digisoft/shared';
import { AppError } from '../common/errors/app-error';

/** A web form submission, sorted into the ticket fields each value belongs to. */
export interface SubmissionResult {
  subject: string;
  description: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  customFields: Record<string, unknown>;
}

/** Validates the submitted values against the form definition and sorts them. */
export function readSubmission(
  fields: WebFormField[],
  values: Record<string, unknown>,
  formName: string,
): SubmissionResult {
  const result: SubmissionResult = {
    subject: formName,
    description: '',
    email: null,
    name: null,
    phone: null,
    customFields: {},
  };
  const issues: { path: string; message: string }[] = [];

  for (const field of fields) {
    const raw = values[field.key];
    const empty = raw === undefined || raw === null || raw === '';

    if (empty) {
      if (field.required) {
        issues.push({ path: field.key, message: `${field.label} is required` });
      }
      continue;
    }

    let value: string | number | boolean = raw as string | number | boolean;

    if (field.type === 'NUMBER') {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        issues.push({ path: field.key, message: `${field.label} must be a number` });
        continue;
      }
      value = parsed;
    } else if (field.type === 'CHECKBOX') {
      value = raw === true || raw === 'true';
    } else if (field.type === 'SELECT') {
      if (!field.options.includes(String(raw))) {
        issues.push({ path: field.key, message: `${field.label} has an unknown option` });
        continue;
      }
      value = String(raw);
    } else {
      value = String(raw).trim();
      if (field.type === 'EMAIL' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
        issues.push({ path: field.key, message: `${field.label} must be an email address` });
        continue;
      }
    }

    switch (field.mapsTo) {
      case 'subject':
        result.subject = String(value).slice(0, 200);
        break;
      case 'description':
        result.description = String(value);
        break;
      case 'email':
        result.email = String(value).toLowerCase();
        break;
      case 'name':
        result.name = String(value);
        break;
      case 'phone':
        result.phone = String(value);
        break;
      default:
        result.customFields[field.key] = value;
    }
  }

  if (!result.description && issues.length === 0) {
    issues.push({ path: 'description', message: 'Describe your request' });
  }
  if (issues.length > 0) {
    throw AppError.validation('Please check the form', issues);
  }
  return result;
}
