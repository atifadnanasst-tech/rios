import { supabase } from '../supabaseClient';

// Suggests near-matches using real trigram similarity (pg_trgm) — this
// is deliberately a SUGGESTION only. The person enriching a contact picks
// deterministically: "yes, this is the same company" (links to the
// existing row) or "no, create a new one" — never auto-merged, same
// pattern as the AI-suggested stage advances elsewhere in the app.
export async function findSimilarCompanies(name: string, threshold = 0.3): Promise<(CompanyRow & { similarity: number })[]> {
  const { data, error } = await supabase.rpc('search_similar_companies', {
    search_name: name.trim(),
    min_similarity: threshold,
  });
  if (error) throw new Error(`Failed to find similar companies: ${error.message}`);
  return data || [];
}

export type CompanyRow = {
  id: string;
  name: string;
  domain: string | null;
  linkedin_url: string | null;
  industry: string | null;
  hq_country: string | null;
  employee_count_range: string | null;
  description: string | null;
  custom_attributes: Record<string, any>;
};

// The core dedup mechanism for the graph foundation: the same company
// referenced by multiple people becomes ONE row, not duplicates — exact
// case-insensitive name match for v1 (real fuzzy matching is a later
// refinement, not solved here).
export async function findOrCreateCompany(
  name: string,
  extra?: { domain?: string; linkedinUrl?: string; industry?: string; hqCountry?: string; description?: string }
): Promise<CompanyRow> {
  const trimmedName = name.trim();

  const { data: existing, error: findError } = await supabase
    .from('companies')
    .select('*')
    .ilike('name', trimmedName)
    .maybeSingle();
  if (findError) throw new Error(`Failed to look up company: ${findError.message}`);
  if (existing) return existing as CompanyRow;

  const { data: created, error: createError } = await supabase
    .from('companies')
    .insert({
      name: trimmedName,
      domain: extra?.domain || null,
      linkedin_url: extra?.linkedinUrl || null,
      industry: extra?.industry || null,
      hq_country: extra?.hqCountry || null,
      description: extra?.description || null,
    })
    .select('*')
    .single();
  if (createError || !created) throw new Error(`Failed to create company: ${createError?.message}`);
  return created as CompanyRow;
}

// Links a relationship to a real company entity — the actual "graph
// edge" this foundation is built around.
export async function linkRelationshipToCompany(relationshipId: string, companyId: string): Promise<void> {
  const { error } = await supabase.from('relationships').update({ company_id: companyId }).eq('id', relationshipId);
  if (error) throw new Error(`Failed to link relationship to company: ${error.message}`);
}

// Everyone linked to a given company — the simple query that "who else
// do I know here" reduces to, now that company is a real entity instead
// of a disconnected text string repeated across many rows.
// Deliberately includes archived contacts (archived_at is returned so the
// UI can label them, same convention as searchRelationships) rather than
// hiding them — consistent with the decision that company/search lookups
// show the full picture, unlike the main work queues.
export async function fetchRelationshipsAtCompany(companyId: string) {
  const { data, error } = await supabase
    .from('relationships')
    .select('id, position, stage, relationship_temperature, archived_at, contacts(first_name, last_name)')
    .eq('company_id', companyId);
  if (error) throw new Error(`Failed to fetch relationships at company: ${error.message}`);
  return data || [];
}
