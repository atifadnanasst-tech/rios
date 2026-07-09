import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { contactName, linkedinProfileText, companyPageText, firstDegreeText, secondDegreeText } = await req.json();

    if (!contactName) {
      return new Response(JSON.stringify({ error: 'contactName is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Server misconfiguration: OPENAI_API_KEY not set.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const prompt = `You are extracting structured business-relationship intelligence from raw LinkedIn text. Extract ONLY what is explicitly present — never invent facts, never guess.

=== CONTACT NAME ===
${contactName}

=== RAW LINKEDIN PROFILE TEXT ===
${linkedinProfileText || '(not provided)'}

=== RAW COMPANY PAGE TEXT (current employer) ===
${companyPageText || '(not provided)'}

=== 1ST DEGREE CONNECTIONS (all entries below are confirmed 1st degree) ===
${firstDegreeText || '(not provided)'}

=== 2ND DEGREE CONNECTIONS (all entries below are confirmed 2nd degree) ===
${secondDegreeText || '(not provided)'}

=== EXTRACTION TASKS ===

1. employment_history — every employer from the PROFILE TEXT:
{ "company_name", "position", "start_date": "YYYY-MM-DD or null", "end_date": "YYYY-MM-DD or null (null if current)", "is_current": boolean }

2. current_company_enrichment — from COMPANY PAGE TEXT only:
{ "company_name", "description", "industry", "hq_country", "hq_address", "employee_count_range", "website", "linkedin_follower_count": integer or null }

3. extracted_facts — facts about the PERSON from the profile. Use ONLY these fact_type values (lowercase):
"education", "certification", "language", "notable_achievement", "community_involvement", "posting_behavior", "recommendation_received", "professional_focus", "mutual_group"
Each: { "fact_type", "value" }

4. mutual_connections — parse ALL persons from BOTH the 1st degree and 2nd degree sections.
For each person, the format in the text is:
[Name] • 1st (or • 2nd)
Job Title
Location
[Message] or [Connect]
* (blank lines — ignore)
*
[Mutual A](url), [Mutual B](url) and [N other mutual connections](url)   ← their connections with you
OR: [Person](url) is a mutual connection   ← single mutual

For each person extract:
{
  "name": string,
  "linkedin_url": their /in/ profile URL or null,
  "connection_degree": "1st" for everyone in the 1ST DEGREE CONNECTIONS section, "2nd" for everyone in the 2ND DEGREE CONNECTIONS section,
  "current_role": job title,
  "current_company": company name if shown,
  "location": location string,
  "their_mutual_connections_with_you": array of NAMES ONLY from the mutual connections line — exclude any entry containing "other mutual connections". Return [] if no such line exists.
}

Examples of their_mutual_connections_with_you:
- "[Mohamed Fouad](url), [Jilesh Kumaran](url) and [424 other mutual connections](url)" → ["Mohamed Fouad", "Jilesh Kumaran"]
- "[Micheal Zaki](url) is a mutual connection" → ["Micheal Zaki"]
- "[Micheal Zaki](url) and [Amer Khan](url) are mutual connections" → ["Micheal Zaki", "Amer Khan"]
- No line present → []

Skip: ads, "Filter by seniority", "Get 50% Off Sales Nav", blank * lines, follower count lines.

5. icp_analysis:
{ "role_authority", "technical_depth", "buying_influence", "overall_reasoning" }

Return ONLY valid JSON, no markdown:
{
  "employment_history": [...],
  "current_company_enrichment": {...} or null,
  "extracted_facts": [...],
  "mutual_connections": [...],
  "icp_analysis": {...}
}`;

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0.1,
        max_tokens: 6000,
        messages: [
          { role: 'system', content: 'Extract structured facts from LinkedIn text. Parse every connection. Use exact fact_type values. Return valid JSON only.' },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text();
      return new Response(JSON.stringify({ error: `OpenAI request failed: ${errText}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await openaiResponse.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || '';
    const cleaned = raw.replace(/^```json?\s*/i, '').replace(/```$/, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return new Response(JSON.stringify({ error: 'Model did not return valid JSON.', raw }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
