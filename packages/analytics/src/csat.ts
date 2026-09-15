import { createHash, randomBytes } from 'node:crypto';
import type { AnalyticsDeps } from './types';

/** Only the hash is stored, so a database copy cannot be used to answer surveys. */
export function hashSurveyToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSurveyToken(): { token: string; tokenHash: string } {
  const token = randomBytes(24).toString('base64url');
  return { token, tokenHash: hashSurveyToken(token) };
}

export class CsatError extends Error {
  constructor(
    message: string,
    readonly reason: 'NOT_FOUND' | 'ALREADY_ANSWERED' | 'EXPIRED',
  ) {
    super(message);
    this.name = 'CsatError';
  }
}

export interface ScheduledSurvey {
  id: string;
  token: string;
  expiresAt: Date;
  subject: string;
  introText: string;
  contactEmail: string;
  contactName: string;
  ticketNumber: number;
  ticketSubject: string;
  delayMinutes: number;
}

/**
 * Creates the survey row for a resolved ticket and returns what the mail needs, or null
 * when surveys are off, the ticket has no reachable contact, or one was already sent —
 * a customer is asked about a ticket once, however many times it is resolved.
 */
export async function scheduleSurvey(
  deps: AnalyticsDeps,
  organizationId: string,
  ticketId: string,
  now: Date = new Date(),
): Promise<ScheduledSurvey | null> {
  const settings = await deps.prisma.csatSettings.findUnique({ where: { organizationId } });
  if (!settings?.isEnabled) return null;

  const ticket = await deps.prisma.ticket.findFirst({
    where: { id: ticketId, organizationId, deletedAt: null },
    select: {
      id: true,
      ticketNumber: true,
      subject: true,
      departmentId: true,
      assignedAgentId: true,
      contact: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
  });
  if (!ticket?.contact?.email) return null;

  const existing = await deps.prisma.csatResponse.findFirst({
    where: { organizationId, ticketId },
    select: { id: true },
  });
  if (existing) return null;

  const { token, tokenHash } = createSurveyToken();
  const expiresAt = new Date(now.getTime() + settings.expiryDays * 86_400_000);

  const response = await deps.prisma.csatResponse.create({
    data: {
      organizationId,
      ticketId,
      contactId: ticket.contact.id,
      agentId: ticket.assignedAgentId,
      departmentId: ticket.departmentId,
      tokenHash,
      expiresAt,
      sentAt: now,
    },
    select: { id: true },
  });

  return {
    id: response.id,
    token,
    expiresAt,
    subject: settings.subject,
    introText: settings.introText,
    contactEmail: ticket.contact.email,
    contactName: `${ticket.contact.firstName} ${ticket.contact.lastName}`.trim(),
    ticketNumber: ticket.ticketNumber,
    ticketSubject: ticket.subject,
    delayMinutes: settings.delayMinutes,
  };
}

const SURVEY_SELECT = {
  id: true,
  organizationId: true,
  status: true,
  rating: true,
  comment: true,
  expiresAt: true,
  respondedAt: true,
  ticket: { select: { id: true, ticketNumber: true, subject: true } },
  organization: { select: { name: true } },
} as const;

/** Looks a survey up by its emailed token, refusing an expired or answered one. */
export async function loadSurvey(deps: AnalyticsDeps, token: string, now: Date = new Date()) {
  const survey = await deps.prisma.csatResponse.findUnique({
    where: { tokenHash: hashSurveyToken(token) },
    select: SURVEY_SELECT,
  });
  if (!survey) throw new CsatError('This survey link is not valid', 'NOT_FOUND');
  if (survey.status === 'ANSWERED') {
    throw new CsatError('This survey has already been answered', 'ALREADY_ANSWERED');
  }
  if (survey.expiresAt <= now) {
    throw new CsatError('This survey link has expired', 'EXPIRED');
  }
  return survey;
}

export async function submitSurvey(
  deps: AnalyticsDeps,
  token: string,
  input: { rating: number; comment?: string | null },
  now: Date = new Date(),
) {
  const survey = await loadSurvey(deps, token, now);
  const settings = await deps.prisma.csatSettings.findUnique({
    where: { organizationId: survey.organizationId },
    select: { thankYouText: true },
  });

  const updated = await deps.prisma.csatResponse.update({
    where: { id: survey.id },
    data: {
      rating: input.rating,
      comment: input.comment ?? null,
      status: 'ANSWERED',
      respondedAt: now,
    },
    select: SURVEY_SELECT,
  });

  return {
    ...updated,
    thankYouText: settings?.thankYouText ?? 'Thank you for your feedback.',
  };
}

/** Marks surveys nobody answered in time, so the response rate stays honest. */
export async function expireSurveys(deps: AnalyticsDeps, now: Date = new Date()): Promise<number> {
  const { count } = await deps.prisma.csatResponse.updateMany({
    where: { status: 'PENDING', expiresAt: { lte: now } },
    data: { status: 'EXPIRED' },
  });
  return count;
}
