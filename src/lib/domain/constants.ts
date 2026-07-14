// Single source of truth for RIOS vocabulary. Nothing in repositories,
// mappers, or components should hardcode these strings directly — import
// from here instead. Matches Constitution doctrine "expand, never contract":
// add new values here, never rename/remove existing ones without a migration.

export const RELATIONSHIP_STAGES = [
  'Discovered',
  'Connected',
  'Recognized',
  'Rapport',
  'Trust',
  'Business Context',
  'Need Identified',
  'Solution Alignment',
  'Commercial Interest',
  'Meeting',
  'RFQ',
  'Quotation',
  'Negotiation',
  'Purchase Order',
  'Execution',
  'Repeat Business',
  'Strategic Partner',
  'Advocate',
] as const;

export const RELATIONSHIP_TEMPERATURES = ['Cold', 'Warm', 'Hot'] as const;

export const WORK_ITEM_CATEGORIES = [
  'Critical',
  'Commitment',
  'Commercial',
  'Relationship Building',
  'Nurture',
] as const;

export const RELATIONSHIP_GOALS = [
  'Commercial Discovery',
  'Repeat Business',
  'Strategic Partnership',
  'Funding',
  'Recruitment',
  'Vendor Qualification',
] as const;

export const SUBSCRIPTION_TIERS = ['free', 'pro', 'enterprise'] as const;

export const USER_ROLES = ['owner', 'manager', 'user'] as const;

export const CONTACT_CHANNELS = ['LinkedIn', 'Email', 'WhatsApp', 'Phone'] as const;

export const OUTREACH_STATUSES = [
  'nurture',
  'contacted',
  'engaged',
  'not_interested',
  'opted_out',
  'do_not_contact',
] as const;

export const ICP_TIERS = ['Tier_A', 'Tier_B', 'Tier_C', 'Tier_D'] as const;

export type RelationshipStage = (typeof RELATIONSHIP_STAGES)[number];
export type RelationshipTemperature = (typeof RELATIONSHIP_TEMPERATURES)[number];
export type WorkItemCategory = (typeof WORK_ITEM_CATEGORIES)[number];
export type RelationshipGoal = (typeof RELATIONSHIP_GOALS)[number];
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];
export type UserRole = (typeof USER_ROLES)[number];
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];
export type OutreachStatus = (typeof OUTREACH_STATUSES)[number];
export type IcpTier = (typeof ICP_TIERS)[number];
