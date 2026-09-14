/**
 * Permission catalogue. Keys are `resource.action` and are the only thing the
 * backend authorises against, so new roles never require code changes.
 */
export const PERMISSIONS = {
  ORGANIZATION_READ: 'organization.read',
  ORGANIZATION_UPDATE: 'organization.update',

  USER_READ: 'user.read',
  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  USER_DELETE: 'user.delete',

  ROLE_READ: 'role.read',
  ROLE_MANAGE: 'role.manage',

  DEPARTMENT_READ: 'department.read',
  DEPARTMENT_MANAGE: 'department.manage',

  TEAM_READ: 'team.read',
  TEAM_MANAGE: 'team.manage',

  CONTACT_READ: 'contact.read',
  CONTACT_CREATE: 'contact.create',
  CONTACT_UPDATE: 'contact.update',
  CONTACT_DELETE: 'contact.delete',

  ACCOUNT_READ: 'account.read',
  ACCOUNT_CREATE: 'account.create',
  ACCOUNT_UPDATE: 'account.update',
  ACCOUNT_DELETE: 'account.delete',

  TICKET_READ: 'ticket.read',
  /// Without this an agent sees only their own tickets and their departments' queues.
  TICKET_READ_ALL: 'ticket.read.all',
  TICKET_CREATE: 'ticket.create',
  TICKET_UPDATE: 'ticket.update',
  TICKET_DELETE: 'ticket.delete',
  TICKET_ASSIGN: 'ticket.assign',
  /// Post a customer-visible reply.
  TICKET_REPLY: 'ticket.reply',
  /// Post an internal comment the customer never sees.
  TICKET_COMMENT: 'ticket.comment',
  TICKET_MERGE: 'ticket.merge',
  /// Manage statuses, priorities, categories and tags.
  TICKET_CONFIG: 'ticket.config',

  ATTACHMENT_CREATE: 'attachment.create',
  ATTACHMENT_DELETE: 'attachment.delete',

  ACTIVITY_READ: 'activity.read',
  ACTIVITY_CREATE: 'activity.create',
  ACTIVITY_UPDATE: 'activity.update',
  ACTIVITY_DELETE: 'activity.delete',

  KB_READ: 'kb.read',
  /// Create, edit, publish and delete knowledge base categories and articles.
  KB_MANAGE: 'kb.manage',

  /// Help center settings and web forms.
  PORTAL_READ: 'portal.read',
  PORTAL_MANAGE: 'portal.manage',

  /// Approve, reject, pin, lock and answer community content.
  COMMUNITY_MODERATE: 'community.moderate',

  /// Assignment rules, automation rules, escalations, SLA policies and blueprints.
  OPERATIONS_READ: 'operations.read',
  OPERATIONS_MANAGE: 'operations.manage',

  /// Channel configuration: email, chat, messaging and telephony.
  CHANNEL_READ: 'channel.read',
  CHANNEL_MANAGE: 'channel.manage',
  /// Pick up and answer live chats.
  CHAT_HANDLE: 'chat.handle',

  /// Outbound webhooks and API keys.
  WEBHOOK_READ: 'webhook.read',
  WEBHOOK_MANAGE: 'webhook.manage',
  APIKEY_MANAGE: 'apikey.manage',

  /// Ask the assistant for summaries, sentiment, intent and draft replies.
  AI_USE: 'ai.use',
  /// Configure the provider, the model, the budget and which features are on.
  AI_MANAGE: 'ai.manage',

  AUDIT_READ: 'audit.read',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS);

export const SYSTEM_ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  AGENT: 'AGENT',
  LIGHT_AGENT: 'LIGHT_AGENT',
  CUSTOMER: 'CUSTOMER',
} as const;

export type SystemRoleKey = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES];

/** Default permission grants per system role, applied at organization creation. */
export const SYSTEM_ROLE_PERMISSIONS: Record<SystemRoleKey, PermissionKey[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  ADMIN: ALL_PERMISSIONS.filter((p) => p !== PERMISSIONS.ORGANIZATION_UPDATE),
  AGENT: [
    PERMISSIONS.ORGANIZATION_READ,
    PERMISSIONS.USER_READ,
    PERMISSIONS.DEPARTMENT_READ,
    PERMISSIONS.TEAM_READ,
    PERMISSIONS.CONTACT_READ,
    PERMISSIONS.CONTACT_CREATE,
    PERMISSIONS.CONTACT_UPDATE,
    PERMISSIONS.ACCOUNT_READ,
    PERMISSIONS.TICKET_READ,
    PERMISSIONS.TICKET_READ_ALL,
    PERMISSIONS.TICKET_CREATE,
    PERMISSIONS.TICKET_UPDATE,
    PERMISSIONS.TICKET_ASSIGN,
    PERMISSIONS.TICKET_REPLY,
    PERMISSIONS.TICKET_COMMENT,
    PERMISSIONS.ATTACHMENT_CREATE,
    PERMISSIONS.ACTIVITY_READ,
    PERMISSIONS.ACTIVITY_CREATE,
    PERMISSIONS.ACTIVITY_UPDATE,
    PERMISSIONS.ACTIVITY_DELETE,
    PERMISSIONS.OPERATIONS_READ,
    PERMISSIONS.KB_READ,
    PERMISSIONS.KB_MANAGE,
    PERMISSIONS.PORTAL_READ,
    PERMISSIONS.COMMUNITY_MODERATE,
    PERMISSIONS.CHANNEL_READ,
    PERMISSIONS.CHAT_HANDLE,
    PERMISSIONS.AI_USE,
  ],
  /// Collaborators: they can read their departments' queues and comment internally,
  /// but never reply to a customer and never see the whole organization's tickets.
  LIGHT_AGENT: [
    PERMISSIONS.ORGANIZATION_READ,
    PERMISSIONS.USER_READ,
    PERMISSIONS.DEPARTMENT_READ,
    PERMISSIONS.CONTACT_READ,
    PERMISSIONS.ACCOUNT_READ,
    PERMISSIONS.TICKET_READ,
    PERMISSIONS.TICKET_COMMENT,
    PERMISSIONS.ACTIVITY_READ,
    PERMISSIONS.KB_READ,
  ],
  CUSTOMER: [],
};
