import { supabase } from '../supabaseClient';

export type RelationshipSearchResult = {
  id: string; // relationships.id
  contactId: string; // contacts.id — needed for enrichment writes to contacts/employment_history/connection edges
  name: string;
  company: string | null;
  position: string | null;
  lastChannel: 'LinkedIn' | 'Email' | 'WhatsApp' | 'Phone' | null;
  isArchived: boolean;
  isSnoozed: boolean;
};

// Searches ALL relationships in Supabase directly, rather than only the
// small number already loaded into the browser. Needed for "have I talked
// to this person before?" style lookups where the contact might not be in
// today's top-scored work queue at all. Used identically by both the
// header search and Enrich Contact's search — one fix here fixes both.
//
// Deliberately includes archived and snoozed contacts (rather than filtering
// them out like the main queues do) — search is how you'd find and unarchive
// or wake someone up, or confirm you already handled them. isArchived/
// isSnoozed let the UI label them (archived always supersedes snoozed in the
// data itself — archiving clears excluded_until — so a contact is never
// truly both at once, but the UI checks isArchived first anyway to be safe).
export async function searchRelationships(query: string, limit = 10): Promise<RelationshipSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return []; // avoid firing a query on every single keystroke of a 1-char input

  // Bug fixed 2026-07-14: this only ever checked "does first_name contain
  // the WHOLE typed string" OR "does last_name contain the WHOLE typed
  // string" — so searching a single name ("Hamza") worked fine, but a
  // full name typed together ("Hamza Abualkibash") never matched, since
  // neither column alone contains that combined phrase. When the query
  // has more than one word, also try first word against first_name AND
  // the remaining words against last_name.
  const words = trimmed.split(/\s+/);
  let filterExpr = `first_name.ilike.%${trimmed}%,last_name.ilike.%${trimmed}%`;
  if (words.length > 1) {
    const firstWord = words[0];
    const restWords = words.slice(1).join(' ');
    filterExpr += `,and(first_name.ilike.%${firstWord}%,last_name.ilike.%${restWords}%)`;
  }

  const { data, error } = await supabase
    .from('relationships')
    .select('id, contact_id, company, position, last_outreach_channel, archived_at, excluded_until, contacts!inner(first_name, last_name)')
    .or(filterExpr, { foreignTable: 'contacts' })
    .limit(limit);

  if (error) throw new Error(`Search failed: ${error.message}`);

  return (data || []).map((row: any) => {
    const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
    return {
      id: row.id,
      contactId: row.contact_id,
      name: contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') : 'Unknown',
      company: row.company,
      position: row.position,
      lastChannel: row.last_outreach_channel,
      isArchived: row.archived_at != null,
      isSnoozed: row.excluded_until != null,
    };
  });
}
