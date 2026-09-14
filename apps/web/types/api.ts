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
