import type { PrismaClient } from '@digisoft/db';
import type { ConditionTree } from '@digisoft/shared';
import { evaluateConditions, type TicketFacts } from './conditions';

export interface AssignmentDecision {
  ruleId: string;
  ruleName: string;
  assignedAgentId: string | null;
  departmentId: string | null;
}

/** Active agents eligible for a rule: the team's members, else the department's. */
async function candidateAgents(
  prisma: PrismaClient,
  organizationId: string,
  rule: { departmentId: string | null; teamId: string | null },
): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      organizationId,
      type: 'AGENT',
      isActive: true,
      deletedAt: null,
      ...(rule.teamId
        ? { teams: { some: { teamId: rule.teamId } } }
        : rule.departmentId
          ? { departments: { some: { departmentId: rule.departmentId } } }
          : {}),
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  return users.map((user) => user.id);
}

/**
 * Evaluates the organization's assignment rules in order and returns the first
 * decision. Round-robin advances a per-rule cursor; least-loaded counts open tickets.
 */
export async function decideAssignment(
  prisma: PrismaClient,
  organizationId: string,
  facts: TicketFacts,
): Promise<AssignmentDecision | null> {
  const rules = await prisma.assignmentRule.findMany({
    where: { organizationId, isActive: true },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });

  for (const rule of rules) {
    if (!evaluateConditions(facts, rule.conditions as ConditionTree)) continue;

    const base = { ruleId: rule.id, ruleName: rule.name, departmentId: rule.departmentId };

    if (rule.strategy === 'SPECIFIC_AGENT') {
      if (!rule.agentId) continue;
      const agent = await prisma.user.findFirst({
        where: { id: rule.agentId, organizationId, isActive: true, deletedAt: null },
        select: { id: true },
      });
      if (!agent) continue;
      return { ...base, assignedAgentId: agent.id };
    }

    if (rule.strategy === 'DEPARTMENT') {
      return { ...base, assignedAgentId: null };
    }

    const candidates = await candidateAgents(prisma, organizationId, rule);
    if (candidates.length === 0) {
      // Nobody to give it to — still route to the department so it lands in a queue.
      return { ...base, assignedAgentId: null };
    }

    if (rule.strategy === 'ROUND_ROBIN') {
      const previous = rule.lastAssignedUserId ? candidates.indexOf(rule.lastAssignedUserId) : -1;
      const next = candidates[(previous + 1) % candidates.length] as string;
      await prisma.assignmentRule.update({
        where: { id: rule.id },
        data: { lastAssignedUserId: next },
      });
      return { ...base, assignedAgentId: next };
    }

    // LEAST_LOADED
    const load = await prisma.ticket.groupBy({
      by: ['assignedAgentId'],
      where: {
        organizationId,
        deletedAt: null,
        assignedAgentId: { in: candidates },
        status: { isResolved: false, isClosed: false },
      },
      _count: { _all: true },
    });
    const counts = new Map(load.map((row) => [row.assignedAgentId, row._count._all]));
    let best = candidates[0] as string;
    let bestCount = counts.get(best) ?? 0;
    for (const candidate of candidates) {
      const count = counts.get(candidate) ?? 0;
      if (count < bestCount) {
        best = candidate;
        bestCount = count;
      }
    }
    return { ...base, assignedAgentId: best };
  }

  return null;
}
