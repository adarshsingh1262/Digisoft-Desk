import { z } from 'zod';

/**
 * The rule DSL shared by assignment rules, automation rules, SLA policies and
 * blueprints. A condition tree is `{ all: [...], any: [...] }`; every leaf compares one
 * ticket field with a value. The evaluator lives in @digisoft/engine.
 */
export const CONDITION_FIELDS = [
  'statusId',
  'priorityId',
  'departmentId',
  'categoryId',
  'assignedAgentId',
  'contactId',
  'accountId',
  'source',
  'tagIds',
  'subject',
  'description',
  'contactIsVip',
  'isAssigned',
  'priorityWeight',
] as const;
export type ConditionField = (typeof CONDITION_FIELDS)[number];

export const CONDITION_OPERATORS = [
  'eq',
  'neq',
  'in',
  'not_in',
  'contains',
  'not_contains',
  'is_empty',
  'is_not_empty',
  'gt',
  'gte',
  'lt',
  'lte',
] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

const conditionValue = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.null(),
]);

export const conditionLeafSchema = z.object({
  field: z.enum(CONDITION_FIELDS),
  op: z.enum(CONDITION_OPERATORS),
  value: conditionValue.optional(),
});
export type ConditionLeaf = z.infer<typeof conditionLeafSchema>;

export const conditionTreeSchema = z.object({
  all: z.array(conditionLeafSchema).max(20).default([]),
  any: z.array(conditionLeafSchema).max(20).default([]),
});
export type ConditionTree = z.infer<typeof conditionTreeSchema>;
export type ConditionTreeInput = z.input<typeof conditionTreeSchema>;

/** Actions an automation rule, escalation or blueprint transition may perform. */
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('assign_agent'), agentId: z.string().min(1) }),
  z.object({ type: z.literal('assign_department'), departmentId: z.string().min(1) }),
  z.object({ type: z.literal('unassign') }),
  z.object({ type: z.literal('set_priority'), priorityId: z.string().min(1) }),
  z.object({ type: z.literal('set_status'), statusId: z.string().min(1) }),
  z.object({ type: z.literal('add_tag'), tagId: z.string().min(1) }),
  z.object({ type: z.literal('remove_tag'), tagId: z.string().min(1) }),
  z.object({ type: z.literal('apply_sla'), slaPolicyId: z.string().min(1) }),
  z.object({
    type: z.literal('notify_users'),
    userIds: z.array(z.string().min(1)).min(1).max(50),
    message: z.string().trim().min(1).max(500),
  }),
  z.object({
    type: z.literal('notify_assignee'),
    message: z.string().trim().min(1).max(500),
  }),
  z.object({
    type: z.literal('notify_department'),
    message: z.string().trim().min(1).max(500),
  }),
  z.object({
    type: z.literal('send_email'),
    to: z.enum(['contact', 'assignee']).or(z.array(z.string().email()).min(1).max(10)),
    subject: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(5000),
  }),
  z.object({
    type: z.literal('add_internal_note'),
    body: z.string().trim().min(1).max(5000),
  }),
  z.object({
    type: z.literal('create_task'),
    subject: z.string().trim().min(1).max(200),
    assignTo: z.enum(['assignee']).or(z.string().min(1)).optional(),
    dueInHours: z.number().int().min(1).max(24 * 90).optional(),
  }),
]);
export type RuleAction = z.infer<typeof actionSchema>;

export const actionListSchema = z.array(actionSchema).max(20);

/**
 * Placeholders allowed in messages, subjects and bodies. Replaced with ticket values
 * by the engine; unknown placeholders are left as-is.
 */
export const TEMPLATE_PLACEHOLDERS = [
  '{{ticket.number}}',
  '{{ticket.subject}}',
  '{{ticket.status}}',
  '{{ticket.priority}}',
  '{{contact.name}}',
  '{{assignee.name}}',
  '{{organization.name}}',
] as const;
