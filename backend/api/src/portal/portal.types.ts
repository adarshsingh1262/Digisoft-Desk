/** The help center resolved from the URL, cached per request by the portal middleware. */
export interface PortalHelpCenter {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  tagline: string | null;
  welcomeMessage: string | null;
  logoUrl: string | null;
  primaryColor: string;
  supportEmail: string | null;
  footerText: string | null;
  isPublished: boolean;
  allowPublicBrowsing: boolean;
  allowSelfRegistration: boolean;
  allowTicketSubmission: boolean;
  kbEnabled: boolean;
  communityEnabled: boolean;
  moderateCommunity: boolean;
}

export const PORTAL_HELP_CENTER_SELECT = {
  id: true,
  organizationId: true,
  slug: true,
  name: true,
  tagline: true,
  welcomeMessage: true,
  logoUrl: true,
  primaryColor: true,
  supportEmail: true,
  footerText: true,
  isPublished: true,
  allowPublicBrowsing: true,
  allowSelfRegistration: true,
  allowTicketSubmission: true,
  kbEnabled: true,
  communityEnabled: true,
  moderateCommunity: true,
} as const;

export const portalCacheKey = (slug: string): string => `portal:help-center:${slug}`;
