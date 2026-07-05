export type RelationshipCategory = 'critical' | 'commitment' | 'commercial' | 'building' | 'nurture';

export type RelationshipStage = 'Introduction' | 'Meeting' | 'Solution Alignment' | 'Trust Building' | 'Recognition' | 'Contract';

export type PriorityLevel = 'High' | 'Medium' | 'Low';

export type CommunicationChannel = 'email' | 'whatsapp' | 'linkedin' | 'phone';

export interface Relationship {
  id: string;
  name: string;
  avatar: string;
  company: string;
  location: string;
  starred: boolean;
  score: number;
  status: 'Hot' | 'Warm' | 'Cold' | 'Stable';
  commercialGoal: string;
  currentStage: RelationshipStage;
  suggestedChannel: CommunicationChannel;
  nextBestAction: string;
  aiConfidence: number; // percentage (e.g. 85)
  tags: string[];
  whyToday: string;
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
