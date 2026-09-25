import type { AutomationTrigger, ConditionTree, RuleAction } from '@digisoft/shared';
import { applyActions } from './actions';
import { evaluateConditions } from './conditions';
import type { EngineDeps } from './deps';
import { loadTicket, toFacts } from './facts';

export interface TriggerJob {
  organizationId: string;
  ticketId: string;
  trigger: AutomationTrigger;
  /** Free-form context (e.g. which SLA target fired); recorded on the run. */
  context?: Record<string, unknown>;
}

export interface TriggerResult {
  evaluated: number;
  fired: number;
}

const MAX_RULES_PER_TRIGGER = 200;

/**
 * Evaluates every active rule for the trigger against the ticket, in order, applying
 * the actions of each match. Each evaluation is recorded as an AutomationRun so an
 * administrator can see exactly why a rule did or did not fire.
 */
export async function runTrigger(deps: EngineDeps, job: TriggerJob): Promise<TriggerResult> {
  const rules = await deps.prisma.automationRule.findMany({
    where: { organizationId: job.organizationId, trigger: job.trigger, isActive: true },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    take: MAX_RULES_PER_TRIGGER,
  });
  if (rules.length === 0) return { evaluated: 0, fired: 0 };

  let fired = 0;
  for (const rule of rules) {
    // Reload each time: an earlier rule may have changed what a later one inspects.
    const ticket = await loadTicket(deps.prisma, job.organizationId, job.ticketId);
    if (!ticket) break;

    const matched = evaluateConditions(toFacts(ticket), rule.conditions as ConditionTree);
    if (!matched) {
      await deps.prisma.automationRun.create({
        data: {
          organizationId: job.organizationId,
          ruleId: rule.id,
          ticketId: ticket.id,
          trigger: job.trigger,
          matched: false,
        },
      });
      continue;
    }

    try {
      const outcomes = await applyActions(deps, job.organizationId, ticket.id, rule.actions as RuleAction[], {
        kind: job.trigger.startsWith('SLA_') ? 'escalation' : 'automation',
        id: rule.id,
        name: rule.name,
      });
      await deps.prisma.automationRun.create({
        data: {
          organizationId: job.organizationId,
          ruleId: rule.id,
          ticketId: ticket.id,
          trigger: job.trigger,
          matched: true,
          actionsApplied: JSON.parse(JSON.stringify({ outcomes, context: job.context ?? null })),
          error: outcomes.some((outcome) => !outcome.ok)
            ? outcomes.filter((outcome) => !outcome.ok).map((outcome) => `${outcome.type}: ${outcome.detail}`).join('; ')
            : null,
        },
      });
      await deps.prisma.automationRule.update({
        where: { id: rule.id },
        data: { runCount: { increment: 1 }, lastRunAt: new Date() },
      });
      fired += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      deps.log('error', `Automation rule ${rule.name} failed`, { ruleId: rule.id, ticketId: ticket.id, message });
      await deps.prisma.automationRun.create({
        data: {
          organizationId: job.organizationId,
          ruleId: rule.id,
          ticketId: ticket.id,
          trigger: job.trigger,
          matched: true,
          error: message,
        },
      });
    }
  }

  return { evaluated: rules.length, fired };
}
