import { supabase } from '../supabaseClient';
import { mapRowToRelationship, buildWorkItemFromRelationship } from './mappers';
import type { RelationshipRow } from './mappers';
import type { Relationship, WorkItem } from '../../types';

const RELATIONSHIP_SELECT = `
  id, company, position, goal, stage, icp_score, icp_tier,
  relationship_temperature, next_best_action, last_outreach_channel,
  classification_confidence, persona, company_type, next_touch_due,
  outreach_status, touch_number, starred,
  contacts ( first_name, last_name, country )
`;

// Supabase's default type inference (without running `supabase gen types`)
// treats an embedded to-one relation conservatively as an array. At runtime
// it's actually a single object for this join, so we cast rather than fight
// the inferred type. Revisit if you ever add real generated types.
type RawRow = Omit<RelationshipRow, 'contacts'> & { contacts: RelationshipRow['contacts'][] | RelationshipRow['contacts'] };
function normalizeRow(row: RawRow): RelationshipRow {
  return { ...row, contacts: Array.isArray(row.contacts) ? row.contacts[0] ?? null : row.contacts } as RelationshipRow;
}

export async function fetchRelationshipRowById(relationshipId: string): Promise<RelationshipRow | null> {
  const { data, error } = await supabase
    .from('relationships')
    .select(RELATIONSHIP_SELECT)
    .eq('id', relationshipId)
    .single();
  if (error || !data) {
    console.error('Failed to fetch relationship by id:', error?.message);
    return null;
  }
  return data as unknown as RelationshipRow;
}

export async function fetchTopRelationships(limit = 25): Promise<Relationship[]> {
  const { data, error } = await supabase
    .from('relationships')
    .select(RELATIONSHIP_SELECT)
    .order('icp_score', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to fetch relationships: ${error.message}`);
  return ((data as RawRow[]) || []).map(normalizeRow).map(mapRowToRelationship);
}

// Work Item Engine doesn't exist yet — this checks the real work_items
// table first (empty today) and falls back to synthesizing from top
// relationships. Once a real engine writes real rows, this function is
// the ONLY place that needs to change; the UI stays untouched.
export async function fetchTodaysWorkItems(limit = 25): Promise<WorkItem[]> {
  const { data: realItems, error: workItemsError } = await supabase
    .from('work_items')
    .select('*, relationships(*, contacts(*))')
    .eq('status', 'pending')
    .order('due_at', { ascending: true })
    .limit(limit);

  if (workItemsError) throw new Error(`Failed to fetch work_items: ${workItemsError.message}`);

  if (realItems && realItems.length > 0) {
    // TODO: once work_items has real rows, map them here properly.
    // Left unimplemented deliberately — no real rows exist yet to test against.
    throw new Error('Real work_items found but mapping not yet implemented — tell Claude to add this.');
  }

  // Fallback: synthesize from relationships due for action.
  const { data, error } = await supabase
    .from('relationships')
    .select(RELATIONSHIP_SELECT)
    .neq('outreach_status', 'opted_out')
    .neq('outreach_status', 'do_not_contact')
    .order('icp_score', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Failed to fetch relationships for work items: ${error.message}`);
  return ((data as RawRow[]) || []).map(normalizeRow).map(buildWorkItemFromRelationship);
}

// "Complete" a synthesized work item: since there's no real work_item row
// to mark done, completing means logging that the recommended action was
// taken and advancing the relationship's touch tracking.
export async function completeRelationshipAction(relationshipId: string, actionText: string): Promise<void> {
  const { error: eventError } = await supabase.from('relationship_events').insert({
    relationship_id: relationshipId,
    event_type: 'note_added',
    message_text: actionText,
    source: 'manual',
  });
  if (eventError) throw new Error(`Failed to log action: ${eventError.message}`);

  const { error: updateError } = await supabase
    .from('relationships')
    .update({ last_outreach_date: new Date().toISOString().slice(0, 10) })
    .eq('id', relationshipId);
  if (updateError) throw new Error(`Failed to update relationship: ${updateError.message}`);
  // touch_number increment intentionally left out of v1 — needs current
  // value read first (or a Postgres function) to increment safely.
  // Add this once you're actually using this action regularly.
}

// Manual override of the algorithm — surfaces a relationship regardless of
// its computed score/tier, for reasons only the owner knows (a personal
// connection, a strategic priority the data can't see).
export async function setRelationshipStarred(relationshipId: string, starred: boolean): Promise<void> {
  const { error } = await supabase.from('relationships').update({ starred }).eq('id', relationshipId);
  if (error) throw new Error(`Failed to update starred: ${error.message}`);
}

// Fixes a real bug: clicking a stage dot previously only updated local
// state, never Supabase — it looked like it worked, then silently reverted
// on refresh. Also logs the change as a real relationship_event, giving a
// genuine audit trail of how a relationship actually progressed over time,
// not just its current snapshot.
export async function updateRelationshipStage(
  relationshipId: string,
  newStage: string,
  oldStage?: string
): Promise<void> {
  const { error: updateError } = await supabase
    .from('relationships')
    .update({ stage: newStage })
    .eq('id', relationshipId);
  if (updateError) throw new Error(`Failed to update stage: ${updateError.message}`);

  // Event logging failure is non-fatal — the stage itself already saved,
  // which is the primary action; losing the audit-trail entry shouldn't
  // surface as an error to the user for what's a secondary record.
  const { error: eventError } = await supabase.from('relationship_events').insert({
    relationship_id: relationshipId,
    event_type: 'stage_changed',
    field_name: 'stage',
    old_value: oldStage || null,
    new_value: newStage,
    source: 'manual',
  });
  if (eventError) console.error('Failed to log stage-change event:', eventError.message);
}
