import { supabase } from '../supabaseClient';

export type RelationshipSearchResult = {
  id: string;
  name: string;
  company: string | null;
  position: string | null;
};

// Searches ALL relationships in Supabase directly — unlike the header search,
// which only filters the small number of relationships already loaded into
// the browser. Needed for "have I talked to this person before?" style lookups
// where the contact might not be in today's top-scored work queue at all.
export async function searchRelationships(query: string, limit = 10): Promise<RelationshipSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return []; // avoid firing a query on every single keystroke of a 1-char input

  const { data, error } = await supabase
    .from('relationships')
    .select('id, company, position, contacts!inner(first_name, last_name)')
    .or(`first_name.ilike.%${trimmed}%,last_name.ilike.%${trimmed}%`, { foreignTable: 'contacts' })
    .limit(limit);

  if (error) throw new Error(`Search failed: ${error.message}`);

  return (data || []).map((row: any) => {
    const contact = Array.isArray(row.contacts) ? row.contacts[0] : row.contacts;
    return {
      id: row.id,
      name: contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') : 'Unknown',
      company: row.company,
      position: row.position,
    };
  });
}
