export type RelationshipCategory = 'critical' | 'commitment' | 'commercial' | 'building' | 'nurture';

export type RelationshipStage =
  | 'Discovered'
  | 'Connected'
  | 'Recognized'
  | 'Rapport'
  | 'Trust'
  | 'Business Context'
  | 'Need Identified'
  | 'Solution Alignment'
  | 'Commercial Interest'
  | 'Meeting'
  | 'RFQ'
  | 'Quotation'
  | 'Negotiation'
  | 'Purchase Order'
  | 'Execution'
  | 'Repeat Business'
  | 'Strategic Partner'
  | 'Advocate';

export type PriorityLevel = 'High' | 'Medium' | 'Low';

export type CommunicationChannel = 'email' | 'whatsapp' | 'linkedin' | 'phone';

export interface Relationship {
  id: string;
  name: string;
  avatar: string;
  company: string;
  position: string;
  suggestedStage: RelationshipStage | null;
  location: string;
  starred: boolean;
  isCommitted: boolean;
  score: number;
  status: 'Hot' | 'Warm' | 'Cold' | 'Stable';
  commercialGoal: string;
  currentStage: RelationshipStage;
  suggestedChannel: CommunicationChannel;
  nextBestAction: string;
  aiConfidence: number; // percentage (e.g. 85)
  tags: string[];
  whyToday: string;
  excludedUntil: string | null; // set while snoozed; the date they resurface
  nextBestActionDraft: string | null; // sendable companion to nextBestAction, when the action is genuinely "send a message"
  nextTouchDue: string | null; // raw ISO date (YYYY-MM-DD) — editing this directly controls Daily Work Queue resurfacing
}

export interface WorkItem {
  id: string;
  relationshipId: string;
  relationship: Relationship;
  category: RelationshipCategory;
  description: string;
  priority: PriorityLevel;
  dueTime: string;
  channel: CommunicationChannel;
  completed: boolean;
  starred: boolean;
}

export interface KPIStats {
  todayMission: number;
  estFocusTime: string;
  advanceCount: number;
  replyRate: string;
}
