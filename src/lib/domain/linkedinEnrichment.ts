import { supabase } from '../supabaseClient';
import { findOrCreateCompany, findSimilarCompanies } from './companies';

export type ParsedEnrichment = {
  employment_history: {
    company_name: string;
    position: string | null;
    start_date: string | null;
    end_date: string | null;
    is_current: boolean;
  }[];
  current_company_enrichment: {
    company_name: string;
    description: string | null;
    industry: string | null;
    hq_country: string | null;
    hq_address: string | null;
    employee_count_range: string | null;
    website: string | null;
    linkedin_follower_count: number | null;
  } | null;
  extracted_facts: { fact_type: string; value: string }[];
  mutual_connections: {
    name: string;
    linkedin_url: string | null;
    connection_degree: '1st' | '2nd' | null;
    current_role: string | null;
    current_company: string | null;
    location: string | null;
    their_mutual_connections_with_you: string[];
  }[];
  icp_analysis: {
    role_authority: string;
    technical_depth: string;
    buying_influence: string;
    overall_reasoning: string;
  };
};

export type EnrichmentWriteResult = {
  // Which companies were created vs found — important for the UI to show
  // the fuzzy-match confirmation flow when needed
  companiesProcessed: { name: string; id: string; wasNew: boolean }[];
  // Which mutual connections were new vs already-known contacts
  mutualConnectionsProcessed: { name: string; id: string; wasNew: boolean }[];
  factsWritten: number;
  employmentRowsWritten: number;
};

// Fuzzy-match check before creating a company — returns the best existing
// match above threshold so the calling UI can ask the user to confirm
// rather than silently creating a duplicate. If the user confirms it's a
// match, pass the existing id back; if not, pass null to create fresh.
export async function checkCompanyBeforeCreate(
  name: string
): Promise<{ id: string; name: string; similarity: number } | null> {
  const matches = await findSimilarCompanies(name, 0.4);
  return matches.length > 0 ? { id: matches[0].id, name: matches[0].name, similarity: matches[0].similarity } : null;
}

// The actual write function — called once the user has confirmed any
// fuzzy-match decisions. companyOverrides maps raw company names to
// either an existing company_id (user confirmed match) or null (create new).
export async function applyLinkedinEnrichment(
  relationshipId: string,
  contactIdHint: string | null | undefined,
  parsed: ParsedEnrichment,
  companyOverrides: Record<string, string | null> = {}
): Promise<EnrichmentWriteResult> {
  // Look up the real contact_id from the relationship if the caller
  // didn't have it — this is what caused all writes to silently fail
  // when the modal was opened with a pre-filled card (activeContactForModals
  // only had the relationship id, not the contacts.id).
  let contactId = contactIdHint;
  if (!contactId) {
    const { data: rel } = await supabase
      .from('relationships')
      .select('contact_id')
      .eq('id', relationshipId)
      .single();
    contactId = rel?.contact_id || null;
  }
  if (!contactId) throw new Error('Could not resolve contact_id for this relationship.');
  const result: EnrichmentWriteResult = {
    companiesProcessed: [],
    mutualConnectionsProcessed: [],
    factsWritten: 0,
    employmentRowsWritten: 0,
  };

  // 1. Employment history — every employer becomes a real company node,
  // not just a string on the contact row. Current employer also updates
  // the live relationship's company_id.
  for (const job of parsed.employment_history || []) {
    try {
      const override = companyOverrides[job.company_name];
      let companyId: string;

      if (override !== undefined) {
        // User already made a decision about this company name
        companyId = override ?? (await findOrCreateCompany(job.company_name)).id;
      } else {
        companyId = (await findOrCreateCompany(job.company_name)).id;
      }

      result.companiesProcessed.push({
        name: job.company_name,
        id: companyId,
        wasNew: override === undefined,
      });

      // Employment history row — upsert on (contact_id, company_id, start_date)
      // so re-running enrichment never creates duplicate rows
      const { error: empError } = await supabase.from('contact_employment_history').upsert(
        {
          contact_id: contactId,
          company_id: companyId,
          company_name_raw: job.company_name,
          position: job.position || null,
          start_date: job.start_date || null,
          end_date: job.is_current ? null : (job.end_date || null),
        },
        { onConflict: 'contact_id,company_id,start_date', ignoreDuplicates: true }
      );
      if (empError) console.error(`Failed to insert employment history for ${job.company_name}:`, empError.message);
      else result.employmentRowsWritten++;

      // Current employer → update the live relationship
      if (job.is_current) {
        const { error: relError } = await supabase
          .from('relationships')
          .update({ company_id: companyId })
          .eq('id', relationshipId);
        if (relError) console.error('Failed to update relationship company_id:', relError.message);

        // Enrich the company row itself if we have the company page intel
        if (parsed.current_company_enrichment) {
          const ce = parsed.current_company_enrichment;
          const { error: coError } = await supabase
            .from('companies')
            .update({
              description: ce.description || null,
              industry: ce.industry || null,
              hq_country: ce.hq_country || null,
              hq_address: ce.hq_address || null,
              employee_count_range: ce.employee_count_range || null,
              website: ce.website || null,
              linkedin_follower_count: ce.linkedin_follower_count || null,
            })
            .eq('id', companyId);
          if (coError) console.error('Failed to enrich company row:', coError.message);
        }
      }
    } catch (err) {
      console.error(`Failed to process company ${job.company_name}:`, err instanceof Error ? err.message : err);
    }
  }

  // Extracted facts → relationship_memory
  // Normalise fact_type to lowercase/underscore and skip exact duplicates
  const facts = (parsed.extracted_facts || []).filter((f: any) => f.fact_type && f.value);
  if (facts.length > 0) {
    // Fetch existing facts to avoid inserting duplicates
    const { data: existingFacts } = await supabase
      .from('relationship_memory')
      .select('fact_type, value')
      .eq('relationship_id', relationshipId)
      .is('superseded_by', null);

    const existingSet = new Set(
      (existingFacts || []).map((f: any) => `${f.fact_type?.toLowerCase()}::${f.value?.toLowerCase()}`)
    );

    const newFacts = facts
      .map((f: any) => ({
        relationship_id: relationshipId,
        fact_type: f.fact_type.toLowerCase().replace(/\s+/g, '_'),
        value: f.value,
        confidence: 'Medium' as const,
        source: 'linkedin_enrichment',
      }))
      .filter((f: any) => !existingSet.has(`${f.fact_type}::${f.value.toLowerCase()}`));

    if (newFacts.length > 0) {
      const { error: memError } = await supabase.from('relationship_memory').insert(newFacts);
      if (memError) console.error('Failed to write relationship memory:', memError.message);
      else result.factsWritten = newFacts.length;
    }
  }

  // Mutual connections processing
  console.log('Mutual connections from AI:', JSON.stringify(
    (parsed.mutual_connections || []).map((m: any) => ({
      name: m.name,
      degree: m.connection_degree,
      shared: m.their_mutual_connections_with_you
    }))
  ));
  // linkedin_url when available), then a contact_connections edge is
  // created between the enriched contact and the mutual. This is the
  // first real graph edge in the system: "these two people are connected."
  for (const mutual of parsed.mutual_connections || []) {
    try {
      let mutualContactId: string | null = null;
      let wasNew = false;

      // Dedup by linkedin_url first (unique column — the strongest signal
      // we have that two profile texts refer to the same real person)
      if (mutual.linkedin_url) {
        const { data: existing } = await supabase
          .from('contacts')
          .select('id')
          .eq('linkedin_url', mutual.linkedin_url)
          .maybeSingle();
        if (existing) mutualContactId = existing.id;
      }

      // Fall back to name match if no LinkedIn URL
      if (!mutualContactId) {
        const nameParts = mutual.name.trim().split(/\s+/);
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(' ') || null;

        const { data: existingByName } = await supabase
          .from('contacts')
          .select('id')
          .ilike('first_name', firstName)
          .ilike('last_name', lastName || '')
          .maybeSingle();
        if (existingByName) mutualContactId = existingByName.id;
      }

      // Create a new contact row if no match found
      if (!mutualContactId) {
        const nameParts = mutual.name.trim().split(/\s+/);
        const { data: newContact, error: newErr } = await supabase
          .from('contacts')
          .insert({
            first_name: nameParts[0],
            last_name: nameParts.slice(1).join(' ') || null,
            linkedin_url: mutual.linkedin_url || null,
            region: mutual.location || null,
          })
          .select('id')
          .single();
        if (newErr || !newContact) {
          console.error(`Failed to create contact for mutual ${mutual.name}:`, newErr?.message);
          continue;
        }
        mutualContactId = newContact.id;
        wasNew = true;
      }

      result.mutualConnectionsProcessed.push({ name: mutual.name, id: mutualContactId, wasNew });

      const [a, b] = [contactId, mutualContactId].sort();
      const sharedConns = mutual.their_mutual_connections_with_you?.length > 0
        ? mutual.their_mutual_connections_with_you.join(', ')
        : null;

      const { error: edgeError } = await supabase
        .from('contact_connections')
        .upsert(
          {
            contact_id_a: a,
            contact_id_b: b,
            source: 'linkedin_mutual',
            discovered_via_relationship_id: relationshipId,
            shared_connections: sharedConns,
            connection_degree: mutual.connection_degree || null,
          },
          { onConflict: 'contact_id_a,contact_id_b', ignoreDuplicates: false }
        );
      if (edgeError) console.error(`Failed to insert connection edge for ${mutual.name}:`, edgeError.message);
    } catch (err) {
      console.error(`Failed to process mutual ${mutual.name}:`, err instanceof Error ? err.message : err);
    }
  }

  return result;
}

// Convenience wrapper for calling the Edge Function from the modal
export async function parseLinkedinEnrichment(
  contactName: string,
  linkedinProfileText: string,
  companyPageText?: string,
  firstDegreeText?: string,
  secondDegreeText?: string
): Promise<ParsedEnrichment> {
  const { data, error } = await supabase.functions.invoke('parse-linkedin-enrichment', {
    body: { contactName, linkedinProfileText, companyPageText, firstDegreeText, secondDegreeText },
  });
  if (error) throw new Error(`Enrichment parsing failed: ${error.message}`);
  return data as ParsedEnrichment;
}

// Fetch all background data for the contact profile panel — employment
// history, memory facts, and network connections. Lazy-loaded only when
// the user expands the panel, not on every card open.
export async function fetchContactBackground(relationshipId: string) {
  // Look up the contact_id from the relationship first — callers shouldn't
  // need to know both IDs, only the relationship they're currently viewing.
  const { data: rel } = await supabase
    .from('relationships')
    .select('contact_id')
    .eq('id', relationshipId)
    .single();
  const contactId = rel?.contact_id;
  if (!contactId) return { employmentHistory: [], memoryFacts: [], connections: [] };

  const [historyRes, factsRes, connectionsRes] = await Promise.all([
    supabase
      .from('contact_employment_history')
      .select('company_name_raw, position, start_date, end_date')
      .eq('contact_id', contactId)
      .order('start_date', { ascending: false, nullsFirst: true }),
    supabase
      .from('relationship_memory')
      .select('fact_type, value, recorded_at')
      .eq('relationship_id', relationshipId)
      .is('superseded_by', null)
      .not('fact_type', 'eq', 'second_degree_via')
      .order('recorded_at', { ascending: false }),
    supabase
      .from('contact_connections')
      .select(`
        contact_id_a, contact_id_b, shared_connections, connection_degree,
        ca:contacts!contact_connections_contact_id_a_fkey(id, first_name, last_name, linkedin_url),
        cb:contacts!contact_connections_contact_id_b_fkey(id, first_name, last_name, linkedin_url)
      `)
      .or(`contact_id_a.eq.${contactId},contact_id_b.eq.${contactId}`)
      .limit(50),
  ]);

  // Surface the *other* person with their contact id and shared_connections
  const connections = (connectionsRes.data || []).map((conn: any) => {
    const isA = conn.contact_id_a === contactId;
    // isA means this contact is in the 'a' slot — so the OTHER person is 'b'
    const other = isA ? conn.cb : conn.ca;
    return other ? {
      id: other.id,
      first_name: other.first_name,
      last_name: other.last_name,
      linkedin_url: other.linkedin_url,
      connection_degree: conn.connection_degree || null,
      shared_connections: conn.shared_connections || null,
    } : null;
  }).filter(Boolean);

  return {
    employmentHistory: historyRes.data || [],
    memoryFacts: factsRes.data || [],
    connections,
  };
}
