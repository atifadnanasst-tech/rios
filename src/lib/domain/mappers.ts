import type { Relationship, WorkItem } from '../../types';

// ============================================================
// NOTE ON FIELD NAMES
// ============================================================
// This maps the real Supabase schema onto the Relationship/WorkItem
// shapes your existing UI components already expect (from types/index.ts).
// I've matched these against the field names described when the app was
// first audited. Run `npx tsc --noEmit` after wiring this in — if any
// property name here doesn't match your actual types/index.ts exactly,
// TypeScript will tell you precisely which one to fix. Don't skip that
// check; guessing wrong here fails silently at runtime otherwise.
// ============================================================

export type RelationshipRow = {
  id: string;
  company: string | null;
  position: string | null;
  goal: string;
  stage: string;
  icp_score: number;
  icp_tier: string | null;
  relationship_temperature: 'Cold' | 'Warm' | 'Hot';
  next_best_action: string | null;
  last_outreach_channel: string | null;
  classification_confidence: 'Low' | 'Medium' | 'High' | null;
  persona: string | null;
  company_type: string | null;
  next_touch_due: string | null;
  outreach_status: string;
  touch_number: number;
  starred: boolean;
  contacts: {
    first_name: string;
    last_name: string | null;
    country: string | null;
  } | null;
};

const CONFIDENCE_TO_PERCENT: Record<string, number> = { Low: 50, Medium: 75, High: 90 };

// The database stores channel values capitalized ('Email', 'LinkedIn',
// 'WhatsApp', 'Phone') per the contact_channel enum, but the frontend's
// CommunicationChannel type uses lowercase ('email', 'linkedin', etc).
// Passing the DB value straight through silently broke channel-based
// logic everywhere it's compared (Send Message, channel switching) since
// none of the lowercase comparisons ever matched — found via a real bug,
// not a hypothetical one.
function mapDbChannelToFrontend(dbChannel: string | null): 'email' | 'linkedin' | 'whatsapp' | 'phone' {
  switch (dbChannel) {
    case 'Email':
      return 'email';
    case 'LinkedIn':
      return 'linkedin';
    case 'WhatsApp':
      return 'whatsapp';
    case 'Phone':
      return 'phone';
    default:
      return 'linkedin';
  }
}

// The UI's mock data used a 4-value status; relationship_temperature only
// has 3 real values, so 'Stable' from the mock never occurs from real data
// — that's expected, not a bug.
export function mapTemperatureToStatus(temp: RelationshipRow['relationship_temperature']): Relationship['status'] {
  return temp; // 'Cold' | 'Warm' | 'Hot' — same words, direct pass-through
}

export function mapRowToRelationship(row: RelationshipRow): Relationship {
  const fullName = row.contacts
    ? [row.contacts.first_name, row.contacts.last_name].filter(Boolean).join(' ')
    : 'Unknown';

  const initials = row.contacts
    ? [row.contacts.first_name, row.contacts.last_name].filter(Boolean).map((n) => n![0]).join('').toUpperCase()
    : '?';

  return {
    id: row.id,
    name: fullName,
    avatar: initials, // no photo source yet — initials placeholder until one exists
    company: row.company || 'Unknown company',
    position: row.position || '',
    location: row.contacts?.country || 'Unknown',
    score: row.icp_score,
    status: mapTemperatureToStatus(row.relationship_temperature),
    starred: row.starred,
    commercialGoal: row.goal,
    currentStage: row.stage,
    tags: [row.persona, row.company_type, row.icp_tier].filter(Boolean) as string[],
    whyToday: buildWhyToday(row),
    nextBestAction: row.next_best_action || 'No specific action recommended yet.',
    aiConfidence: row.classification_confidence ? CONFIDENCE_TO_PERCENT[row.classification_confidence] : 50,
    suggestedChannel: mapDbChannelToFrontend(row.last_outreach_channel),
  } as Relationship;
}

// whyToday and nextBestAction are distinct fields in the real type: nextBestAction
// is the recommended action, whyToday is the reason this relationship surfaced.
// The source data has no separate "reason" field, so this synthesizes one from
// what we do have — a real Relationship Intelligence Engine can replace this later.
function buildWhyToday(row: RelationshipRow): string {
  if (row.outreach_status === 'engaged') return 'Recently engaged — keep the momentum going.';
  if (row.next_touch_due && new Date(row.next_touch_due) < new Date()) return 'Follow-up is overdue.';
  if (row.icp_tier === 'Tier_A') return 'High-priority relationship (Tier A).';
  return 'Due for periodic outreach.';
}

// Real due date, no fake time-of-day. Shows "Today" when it matches the
// current date, a short formatted date otherwise, or an honest "No date
// set" if next_touch_due is genuinely empty — never invents a value.
function formatDueDate(dateStr: string | null): string {
  if (!dateStr) return 'No date set';
  const due = new Date(dateStr);
  const today = new Date();
  const isToday =
    due.getFullYear() === today.getFullYear() &&
    due.getMonth() === today.getMonth() &&
    due.getDate() === today.getDate();
  if (isToday) return 'Today';
  return due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Since the real Work Item Engine doesn't exist yet, we build a
// WorkItem-shaped object directly from a relationship that's due for
// action. The day a real 'work_items' table has rows, swap this function
// out in relationships.ts — no UI code changes required.
export function buildWorkItemFromRelationship(row: RelationshipRow): WorkItem {
  const relationship = mapRowToRelationship(row);
  return {
    id: `synthetic-${row.id}`,
    relationshipId: row.id,
    relationship,
    category: mapOutreachStatusToCategory(row.outreach_status, row.next_touch_due),
    description: row.next_best_action || 'Review this relationship',
    priority: row.icp_tier === 'Tier_A' ? 'High' : row.icp_tier === 'Tier_B' ? 'Medium' : 'Low',
    // The schema only tracks a due DATE, not a time of day, so this is a
    // fixed placeholder — real per-item scheduling doesn't exist yet.
    // Format matters: snoozeWorkItem() parses this as "H:MM AM/PM".
    // Real due date, not a fake time-of-day — the schema only ever tracked
    // a date, never a time. Labeled "Today" when it matches, otherwise a
    // short formatted date; "No date set" if next_touch_due is genuinely empty.
    dueTime: formatDueDate(row.next_touch_due),
    channel: mapDbChannelToFrontend(row.last_outreach_channel),
    completed: false,
    starred: false,
  } as WorkItem;
}

function mapOutreachStatusToCategory(status: string, nextTouchDue: string | null): WorkItem['category'] {
  if (status === 'engaged') return 'commercial';
  if (nextTouchDue && new Date(nextTouchDue) < new Date()) return 'commitment';
  return 'nurture';
}
