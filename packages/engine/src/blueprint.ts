import type { Prisma, PrismaClient } from '@digisoft/db';
import type { ConditionTree, RuleAction, TransitionRequiredField } from '@digisoft/shared';
import { evaluateConditions, type TicketFacts } from './conditions';
import type { TicketRecord } from './facts';

export interface TransitionOption {
  transitionId: string;
  name: string;
  toStatusId: string;
  requiredFields: TransitionRequiredField[];
  allowedRoleIds: string[];
  actions: RuleAction[];
}

export type BlueprintWithTransitions = Prisma.BlueprintGetPayload<{ include: { transitions: true } }>;

/** The first active blueprint whose conditions match this ticket, with its transitions. */
export async function findBlueprint(
  prisma: PrismaClient,
  organizationId: string,
  facts: TicketFacts,
): Promise<BlueprintWithTransitions | null> {
  const blueprints = await prisma.blueprint.findMany({
    where: { organizationId, isActive: true },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    include: { transitions: { orderBy: { position: 'asc' } } },
  });
  return blueprints.find((blueprint) => evaluateConditions(facts, blueprint.conditions as ConditionTree)) ?? null;
}

/** Transitions available from the ticket's current status under its blueprint. */
export function transitionsFrom(
  blueprint: BlueprintWithTransitions,
  facts: TicketFacts,
): TransitionOption[] {
  return blueprint.transitions
    .filter(
      (transition) =>
        (transition.fromStatusId === null || transition.fromStatusId === facts.statusId) &&
        transition.toStatusId !== facts.statusId &&
        evaluateConditions(facts, transition.conditions as ConditionTree),
    )
    .map((transition) => ({
      transitionId: transition.id,
      name: transition.name,
      toStatusId: transition.toStatusId,
      requiredFields: transition.requiredFields as TransitionRequiredField[],
      allowedRoleIds: transition.allowedRoleIds as string[],
      actions: transition.actions as RuleAction[],
    }));
}

export interface TransitionCheck {
  ok: boolean;
  reason?: string;
  missingFields?: TransitionRequiredField[];
  transition?: TransitionOption;
}

/** Fields the transition needs, checked against the ticket plus what the caller is supplying now. */
export function missingRequiredFields(
  ticket: Pick<TicketRecord, 'resolutionNote' | 'assignedAgentId' | 'departmentId' | 'categoryId' | 'contactId' | 'tags'>,
  required: TransitionRequiredField[],
  supplied: { resolutionNote?: string | null },
): TransitionRequiredField[] {
  const present: Record<TransitionRequiredField, boolean> = {
    resolutionNote: Boolean(supplied.resolutionNote ?? ticket.resolutionNote),
    assignedAgentId: Boolean(ticket.assignedAgentId),
    departmentId: Boolean(ticket.departmentId),
    categoryId: Boolean(ticket.categoryId),
    contactId: Boolean(ticket.contactId),
    tags: ticket.tags.length > 0,
  };
  return required.filter((field) => !present[field]);
}

/**
 * Whether the actor may move the ticket to `toStatusId`. No blueprint means any
 * status is reachable — the blueprint only ever narrows what is allowed.
 */
export function checkTransition(
  options: TransitionOption[],
  ticket: Pick<TicketRecord, 'resolutionNote' | 'assignedAgentId' | 'departmentId' | 'categoryId' | 'contactId' | 'tags'>,
  toStatusId: string,
  actorRoleIds: string[],
  supplied: { resolutionNote?: string | null },
): TransitionCheck {
  const candidates = options.filter((option) => option.toStatusId === toStatusId);
  if (candidates.length === 0) {
    return { ok: false, reason: 'This status is not reachable from the current one under the ticket\'s workflow' };
  }

  const permitted = candidates.filter(
    (option) => option.allowedRoleIds.length === 0 || option.allowedRoleIds.some((roleId) => actorRoleIds.includes(roleId)),
  );
  if (permitted.length === 0) {
    return { ok: false, reason: 'Your role is not allowed to make this transition' };
  }

  for (const option of permitted) {
    const missing = missingRequiredFields(ticket, option.requiredFields, supplied);
    if (missing.length === 0) return { ok: true, transition: option };
  }

  const first = permitted[0] as TransitionOption;
  return {
    ok: false,
    reason: 'Fill in the required fields before making this transition',
    missingFields: missingRequiredFields(ticket, first.requiredFields, supplied),
    transition: first,
  };
}
