import { supabase } from '../supabaseClient';

export type RelationshipHistoryEntry = {
  id: string;
  eventType: string;
  direction: 'Sent' | 'Received' | null;
  channel: string | null;
  messageText: string | null;
  messageDate: string | null;
  touchNumber: number | null;
  createdAt: string;
  source: string;
};

export type HistoryPage = {
  entries: RelationshipHistoryEntry[];
  hasMore: boolean;
};

// Ordering, in priority:
//   1. message_date — when it actually happened, not when it was entered
//      into the system (bulk imports can insert hundreds of rows with
//      nearly-identical created_at, which would shuffle same-day messages
//      if sorted by insertion time).
//   2. created_at — the tiebreaker. touch_number was tried as a secondary
//      key and reverted: real data showed it ties across same-day
//      messages (doesn't disambiguate) and actively mis-ordered newer,
//      individually-logged entries (null touch_number) relative to older
//      bulk-imported ones. created_at alone correctly reflects real
//      logging order for anything entered live through the app, and for
//      old bulk-imported same-day batches sharing identical timestamps,
//      there is no more precise signal available in the source data —
//      an unavoidable limit of that historical data, not a sortable gap.
//
// Pagination is offset-based (not cursor-based) for simplicity — fine for
// this use case since history doesn't change fast enough for offset drift
// to matter in practice.
export async function fetchRelationshipHistory(
  relationshipId: string,
  limit = 50,
  offset = 0
): Promise<HistoryPage> {
  const { data, error } = await supabase
    .from('relationship_events')
    .select('id, event_type, direction, channel, message_text, message_date, touch_number, created_at, source')
    .eq('relationship_id', relationshipId)
    .order('message_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(`Failed to fetch history: ${error.message}`);

  const entries = (data || [])
    .map((row: any) => ({
      id: row.id,
      eventType: row.event_type,
      direction: row.direction,
      channel: row.channel,
      messageText: row.message_text,
      messageDate: row.message_date,
      touchNumber: row.touch_number,
      createdAt: row.created_at,
      source: row.source,
    }))
    .reverse(); // this page's rows are DESC (recent-first); reverse for ASC display order

  return {
    entries,
    hasMore: (data || []).length === limit, // a full page means there might be more beyond it
  };
}

export async function updateHistoryEntry(
  id: string,
  patch: { messageDate?: string | null; channel?: string | null }
): Promise<void> {
  const payload: Record<string, any> = {};
  if (patch.messageDate !== undefined) payload.message_date = patch.messageDate;
  if (patch.channel !== undefined) payload.channel = patch.channel;
  const { error } = await supabase.from('relationship_events').update(payload).eq('id', id);
  if (error) throw new Error(`Failed to update history entry: ${error.message}`);
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  const { error } = await supabase.from('relationship_events').delete().eq('id', id);
  if (error) throw new Error(`Failed to delete history entry: ${error.message}`);
}
