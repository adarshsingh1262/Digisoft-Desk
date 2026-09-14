import type { ContactStatus } from '@digisoft/shared';

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  domain: string | null;
  timezone: string;
  locale: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessHours {
  id: string;
  name: string;
  timezone: string;
  isDefault: boolean;
  weeklySchedule: { day: number; start: string; end: string }[];
  holidays: { id: string; name: string; date: string }[];
}

export interface RoleRef {
  id: string;
  name: string;
  systemKey: string | null;
}

export interface DepartmentRef {
  id: string;
  name: string;
}

export interface UserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  avatarUrl: string | null;
  type: 'AGENT' | 'CUSTOMER';
  isActive: boolean;
  emailVerifiedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  roles: { role: RoleRef }[];
  departments: { department: DepartmentRef }[];
}

export interface Role extends RoleRef {
  description: string | null;
  isSystem: boolean;
  permissions: { permission: { key: string } }[];
  _count: { users: number };
}

export interface Permission {
  key: string;
  resource: string;
  action: string;
  description: string | null;
}

export interface Department {
  id: string;
  name: string;
  description: string | null;
  email: string | null;
  isDefault: boolean;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { members: number; teams: number };
}

export interface Team {
  id: string;
  name: string;
  description: string | null;
  departmentId: string | null;
  department: DepartmentRef | null;
  members: { user: { id: string; firstName: string; lastName: string; email: string } }[];
}

export interface AccountSummary {
  id: string;
  name: string;
  website: string | null;
  industry: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  country: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { contacts: number };
}

export interface AccountDetail extends Omit<AccountSummary, '_count'> {
  addressLine1: string | null;
  addressLine2: string | null;
  state: string | null;
  postalCode: string | null;
  description: string | null;
}

export interface ContactSummary {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  jobTitle: string | null;
  status: ContactStatus;
  isVip: boolean;
  createdAt: string;
  updatedAt: string;
  account: { id: string; name: string } | null;
}

export interface ContactDetail extends ContactSummary {
  avatarUrl: string | null;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface TicketStatusRef {
  id: string;
  name: string;
  color: string;
  isResolved: boolean;
  isClosed: boolean;
}

export interface TicketStatusConfig extends TicketStatusRef {
  systemKey: string | null;
  position: number;
  isDefault: boolean;
  pausesSla: boolean;
  isSystem: boolean;
}

export interface TicketPriorityRef {
  id: string;
  name: string;
  color: string;
  weight: number;
}

export interface TicketPriorityConfig extends TicketPriorityRef {
  systemKey: string | null;
  position: number;
  isDefault: boolean;
  isSystem: boolean;
}

export interface TicketCategory {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
}

export interface TagRef {
  id: string;
  name: string;
  color: string;
}

export interface TagWithCount extends TagRef {
  _count: { tickets: number };
}

export interface TicketSummary extends SlaFields {
  id: string;
  ticketNumber: number;
  subject: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  dueAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  status: TicketStatusRef;
  priority: TicketPriorityRef;
  category: { id: string; name: string } | null;
  department: DepartmentRef | null;
  assignedAgent: { id: string; firstName: string; lastName: string; email: string } | null;
  contact: { id: string; firstName: string; lastName: string | null; email: string | null } | null;
  account: { id: string; name: string } | null;
  tags: { tag: TagRef }[];
  _count: { messages: number; attachments: number };
}

export interface TicketDetail extends Omit<TicketSummary, 'contact'> {
  description: string;
  resolutionNote: string | null;
  customFields: Record<string, unknown> | null;
  mergedIntoTicketId: string | null;
  createdBy: { id: string; firstName: string; lastName: string } | null;
  contact:
    | {
        id: string;
        firstName: string;
        lastName: string | null;
        email: string | null;
        phone: string | null;
        jobTitle: string | null;
        isVip: boolean;
        account: { id: string; name: string } | null;
      }
    | null;
  followers: { userId: string }[];
  links: {
    id: string;
    type: string;
    linkedTicket: {
      id: string;
      ticketNumber: number;
      subject: string;
      status: { name: string; color: string };
    };
  }[];
}

export interface TicketAttachment {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  messageId: string | null;
  createdAt: string;
  uploadedBy?: { id: string; firstName: string; lastName: string } | null;
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  type: 'PUBLIC_REPLY' | 'INTERNAL_COMMENT' | 'SYSTEM_NOTE';
  direction: 'INBOUND' | 'OUTBOUND';
  bodyText: string;
  bodyHtml: string | null;
  channel: string;
  createdAt: string;
  authorUser: { id: string; firstName: string; lastName: string; email: string } | null;
  authorContact: { id: string; firstName: string; lastName: string | null; email: string | null } | null;
  attachments: TicketAttachment[];
}

export interface TicketHistoryEntry {
  id: string;
  action: string;
  actorId: string | null;
  actorType: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; firstName: string; lastName: string } | null;
}

export interface TicketQueueSummary {
  total: number;
  open: number;
  unassigned: number;
  assignedToMe: number;
  resolved: number;
  byStatus: { statusId: string; _count: { _all: number } }[];
}

// ---------------------------------------------------------------------------
// Phase 3 — support operations
// ---------------------------------------------------------------------------

export interface SlaFields {
  firstResponseAt: string | null;
  firstResponseDueAt: string | null;
  resolutionDueAt: string | null;
  firstResponseBreachedAt: string | null;
  resolutionBreachedAt: string | null;
  slaPausedAt: string | null;
  slaPolicy: { id: string; name: string } | null;
}

export interface Activity {
  id: string;
  type: 'TASK' | 'CALL' | 'EVENT';
  status: 'OPEN' | 'COMPLETED' | 'CANCELLED';
  subject: string;
  description: string | null;
  dueAt: string | null;
  startAt: string | null;
  endAt: string | null;
  completedAt: string | null;
  callDirection: 'INBOUND' | 'OUTBOUND' | null;
  callDurationSeconds: number | null;
  callOutcome: string | null;
  location: string | null;
  createdAt: string;
  updatedAt: string;
  ticket: { id: string; ticketNumber: number; subject: string } | null;
  contact: { id: string; firstName: string; lastName: string | null } | null;
  account: { id: string; name: string } | null;
  assignedTo: { id: string; firstName: string; lastName: string } | null;
  createdBy: { id: string; firstName: string; lastName: string } | null;
}

export interface ConditionLeafDto {
  field: string;
  op: string;
  value?: string | number | boolean | string[] | null;
}
export interface ConditionTreeDto {
  all: ConditionLeafDto[];
  any: ConditionLeafDto[];
}

export interface AssignmentRule {
  id: string;
  name: string;
  isActive: boolean;
  position: number;
  conditions: ConditionTreeDto;
  strategy: 'SPECIFIC_AGENT' | 'DEPARTMENT' | 'ROUND_ROBIN' | 'LEAST_LOADED';
  departmentId: string | null;
  teamId: string | null;
  agentId: string | null;
  department: { id: string; name: string } | null;
  team: { id: string; name: string } | null;
  agent: { id: string; firstName: string; lastName: string } | null;
}

export interface AutomationRule {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  position: number;
  trigger: string;
  conditions: ConditionTreeDto;
  actions: Record<string, unknown>[];
  runCount: number;
  lastRunAt: string | null;
  createdAt: string;
}

export interface AutomationRun {
  id: string;
  trigger: string;
  matched: boolean;
  actionsApplied: { outcomes?: { type: string; ok: boolean; detail?: string }[] } | null;
  error: string | null;
  createdAt: string;
  rule: { id: string; name: string };
  ticket: { id: string; ticketNumber: number; subject: string } | null;
}

export interface SlaPolicy {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isDefault: boolean;
  position: number;
  conditions: ConditionTreeDto;
  businessHoursId: string | null;
  warningMinutesBefore: number;
  businessHours: { id: string; name: string; timezone: string } | null;
  targets: {
    id: string;
    priorityId: string | null;
    firstResponseMinutes: number;
    resolutionMinutes: number;
    useBusinessHours: boolean;
    priority: { id: string; name: string } | null;
  }[];
  _count: { tickets: number };
}

export interface Blueprint {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  position: number;
  conditions: ConditionTreeDto;
  transitions: {
    id: string;
    name: string;
    fromStatusId: string | null;
    toStatusId: string;
    requiredFields: string[];
    allowedRoleIds: string[];
    fromStatus: { id: string; name: string; color: string } | null;
    toStatus: { id: string; name: string; color: string };
  }[];
}

export interface TicketTransitions {
  governed: boolean;
  blueprint?: { id: string; name: string };
  transitions: {
    transitionId: string;
    name: string;
    toStatusId: string;
    requiredFields: string[];
  }[];
}
