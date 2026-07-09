import { supabase } from '../supabaseClient';
import { mapRowToRelationship, buildWorkItemFromRelationship } from './mappers';
import type { RelationshipRow } from './mappers';
import type { Relationship, WorkItem } from '../../types';

const RELATIONSHIP_SELECT = `
  id, company, position, goal, stage, icp_score, icp_tier,
  relationship_temperature, next_best_action, last_outreach_channel,
  classification_confidence, persona, company_type, next_touch_due,
  outreach_status, touch_number, starred, suggested_stage, is_committed,
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

// Real server-side paginated browse of ALL contacts — not filtered by
// daily work logic. Used by the "All Contacts" tab.
export async function fetchAllRelationshipsPaginated(
  page: number,
  pageSize: number,
  sortBy: 'icp_score' | 'name' | 'last_touch' = 'icp_score'
): Promise<{ items: WorkItem[]; total: number }> {
  const offset = (page - 1) * pageSize;

  const sortColumn = sortBy === 'name' ? 'contacts(first_name)' : sortBy === 'last_touch' ? 'last_outreach_date' : 'icp_score';

  const { data, error, count } = await supabase
    .from('relationships')
    .select(RELATIONSHIP_SELECT, { count: 'exact' })
    .neq('outreach_status', 'opted_out')
    .neq('outreach_status', 'do_not_contact')
    .is('archived_at', null)
    .order('icp_score', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) throw new Error(`Failed to fetch all contacts: ${error.message}`);
  const items = ((data as unknown as RawRow[]) || []).map(normalizeRow).map(buildWorkItemFromRelationship);
  return { items, total: count || 0 };
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
export async function fetchTodaysWorkItems(limit = 100): Promise<WorkItem[]> {
  const { data: realItems, error: workItemsError } = await supabase
    .from('work_items')
    .select('*, relationships(*, contacts(*))')
    .eq('status', 'pending')
    .order('due_at', { ascending: true })
    .limit(limit);

  if (workItemsError) throw new Error(`Failed to fetch work_items: ${workItemsError.message}`);

  if (realItems && realItems.length > 0) {
    throw new Error('Real work_items found but mapping not yet implemented — tell Claude to add this.');
  }

  const today = new Date().toISOString().slice(0, 10);

  // Priority 1: overdue or due today AND already touched — real follow-ups
  const { data: followUps, error: followUpsError } = await supabase
    .from('relationships')
    .select(RELATIONSHIP_SELECT)
    .neq('outreach_status', 'opted_out')
    .neq('outreach_status', 'do_not_contact')
    .is('archived_at', null)
    .gt('touch_number', 0)
    .not('next_touch_due', 'is', null)
    .lte('next_touch_due', today)
    .order('icp_score', { ascending: false })
    .limit(limit);

  if (followUpsError) throw new Error(`Failed to fetch follow-ups: ${followUpsError.message}`);
  const results = ((followUps as RawRow[]) || []).map(normalizeRow).map(buildWorkItemFromRelationship);
  const loadedIds = new Set(results.map(r => r.relationshipId));

  // Priority 2: today's cron-selected untouched contacts (next_touch_due = today)
  // The cron sets next_touch_due = today for touch=0 contacts it selected,
  // so this surfaces exactly who the cron chose for today's outreach
  if (results.length < limit) {
    const remaining = limit - results.length;
    const { data: todaySelected, error: todayError } = await supabase
      .from('relationships')
      .select(RELATIONSHIP_SELECT)
      .neq('outreach_status', 'opted_out')
      .neq('outreach_status', 'do_not_contact')
      .is('archived_at', null)
      .eq('touch_number', 0)
      .eq('next_touch_due', today)
      .order('icp_score', { ascending: false })
      .limit(remaining);

    if (!todayError && todaySelected) {
      const extra = ((todaySelected as RawRow[]) || [])
        .map(normalizeRow)
        .map(buildWorkItemFromRelationship)
        .filter(item => !loadedIds.has(item.relationshipId));
      extra.forEach(item => { results.push(item); loadedIds.add(item.relationshipId); });
    }
  }

  // Priority 3: fill any remaining slots with top ICP untouched contacts
  // (before cron has run, or if quota wasn't fully filled)
  if (results.length < limit) {
    const remaining = limit - results.length;
    const { data: fallback, error: fallbackError } = await supabase
      .from('relationships')
      .select(RELATIONSHIP_SELECT)
      .neq('outreach_status', 'opted_out')
      .neq('outreach_status', 'do_not_contact')
      .is('archived_at', null)
      .eq('touch_number', 0)
      .is('next_touch_due', null)
      .order('icp_score', { ascending: false })
      .limit(remaining);

    if (!fallbackError && fallback) {
      const extra = ((fallback as RawRow[]) || [])
        .map(normalizeRow)
        .map(buildWorkItemFromRelationship)
        .filter(item => !loadedIds.has(item.relationshipId));
      results.push(...extra);
    }
  }

  return results;
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

export async function setRelationshipCommitted(relationshipId: string, isCommitted: boolean): Promise<void> {
  const { error } = await supabase.from('relationships').update({ is_committed: isCommitted }).eq('id', relationshipId);
  if (error) throw new Error(`Failed to update committed: ${error.message}`);
}

// Accepting an AI-suggested stage advance applies it via the exact same
// (correctly-persisting) stage-update path as a manual change, then
// clears the suggestion. Dismissing just clears it, without touching the
// real stage — per the Constitution's rule that AI never owns business
// logic, this is always the owner's decision, never automatic.
export async function acceptSuggestedStage(relationshipId: string, suggestedStage: string, oldStage: string): Promise<void> {
  await updateRelationshipStage(relationshipId, suggestedStage, oldStage);
  const { error } = await supabase.from('relationships').update({ suggested_stage: null }).eq('id', relationshipId);
  if (error) throw new Error(`Failed to clear suggested stage: ${error.message}`);
}

export async function dismissSuggestedStage(relationshipId: string): Promise<void> {
  const { error } = await supabase.from('relationships').update({ suggested_stage: null }).eq('id', relationshipId);
  if (error) throw new Error(`Failed to dismiss suggested stage: ${error.message}`);
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

// Creates a minimal relationship row for a contact who was discovered as
// a mutual connection but doesn't have an active relationship yet.
// This makes them first-class citizens in RIOS — same pipeline, just
// starting from a thinner baseline. Org ID is read from an existing
// relationship to avoid requiring the caller to know it.
export async function findOrCreateRelationshipForContact(
  contactId: string,
  orgId?: string
): Promise<string | null> {
  // Resolve org ID — if not passed, read it from any existing relationship
  // (all relationships in a single-org deployment share the same org ID)
  let resolvedOrgId = orgId;
  if (!resolvedOrgId) {
    const { data: anyRel } = await supabase
      .from('relationships')
      .select('organisation_id')
      .limit(1)
      .single();
    resolvedOrgId = anyRel?.organisation_id;
  }
  if (!resolvedOrgId) {
    console.error('Could not resolve organisation_id for contact relationship creation');
    return null;
  }

  // Check if a relationship already exists
  const { data: existing } = await supabase
    .from('relationships')
    .select('id')
    .eq('contact_id', contactId)
    .eq('organisation_id', resolvedOrgId)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from('relationships')
    .insert({
      contact_id: contactId,
      organisation_id: resolvedOrgId,
      stage: 'Discovered',
      relationship_temperature: 'Cold',
      outreach_status: 'nurture',
      goal: 'Commercial Discovery',
      icp_score: 0,
      touch_number: 0,
    })
    .select('id')
    .single();
  if (error || !created) {
    console.error('Failed to create minimal relationship:', error?.message);
    return null;
  }
  return created.id;
}
