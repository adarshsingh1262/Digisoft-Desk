import type { Job } from 'bullmq';
import type { Logger } from 'pino';
import { AiDisabledError, loadSettings, runInsight, type AiDeps, type AiTaskType } from '@digisoft/ai';

export interface AiAnalyseJob {
  organizationId: string;
  ticketId: string;
  /** Which insights to (re)generate; defaults to the three automatic ones. */
  types?: AiTaskType[];
  reason: 'TICKET_CREATED' | 'CUSTOMER_REPLIED' | 'MANUAL';
}

const AUTOMATIC: AiTaskType[] = ['SUMMARY', 'SENTIMENT', 'INTENT'];

/**
 * Generates the automatic insights for a ticket, out of the request path.
 *
 * Two guards keep this cheap: the organization must have `autoAnalyse` on, and a task
 * whose feature is switched off is skipped rather than attempted. Everything else —
 * budget, grounding, provider choice, failure recording — is the shared analysis path,
 * the same one the API uses when an agent presses the button.
 */
export async function handleAiAnalyse(
  job: Job<AiAnalyseJob>,
  deps: AiDeps & { logger: Logger },
): Promise<{ generated: string[]; skipped: string[] }> {
  const { organizationId, ticketId, reason } = job.data;
  const settings = await loadSettings(deps, organizationId);

  if (!settings.isEnabled || !settings.autoAnalyse) {
    return { generated: [], skipped: ['auto-analysis is off'] };
  }

  const types = job.data.types ?? AUTOMATIC;
  const generated: string[] = [];
  const skipped: string[] = [];

  for (const type of types) {
    try {
      const insight = await runInsight(deps, organizationId, ticketId, type, {
        // A customer reply changes the thread, so the previous insight is stale.
        refresh: reason === 'CUSTOMER_REPLIED',
      });
      if (insight.status === 'READY') {
        generated.push(type);
      } else {
        skipped.push(`${type}: ${insight.error ?? 'failed'}`);
      }
    } catch (error) {
      if (error instanceof AiDisabledError) {
        skipped.push(`${type}: ${error.message}`);
        continue;
      }
      throw error;
    }
  }

  deps.logger.info(
    { jobId: job.id, organizationId, ticketId, reason, generated, skipped },
    `AI analysis for ticket ${ticketId}`,
  );
  return { generated, skipped };
}
