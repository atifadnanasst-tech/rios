import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { relationshipId, incomingMessage, userGuidance } = await req.json();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Read org's configured draft model
    const { data: rel } = await supabase.from('relationships').select('organisation_id').eq('id', relationshipId).single();
    const { data: org } = await supabase.from('organisations').select('ai_draft_model').eq('id', rel?.organisation_id).single();
    const draftModel = org?.ai_draft_model || 'gpt-4o-mini';

    if (!relationshipId || !incomingMessage || typeof incomingMessage !== 'string' || incomingMessage.trim().length < 2) {
      return new Response(
        JSON.stringify({ error: 'relationshipId and incomingMessage are required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Uses the service role — bypasses RLS entirely, safe here because this
    // only ever runs server-side inside the Edge Function, never in the browser.

    // 1. Relationship + contact context
    const { data: rel, error: relError } = await supabase
      .from('relationships')
      .select('id, organisation_id, goal, stage, company, position, persona, next_best_action, contacts(first_name, last_name)')
      .eq('id', relationshipId)
      .single();
    if (relError || !rel) {
      return new Response(JSON.stringify({ error: 'Relationship not found.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const contactRaw = (rel as any).contacts;
    const contact = Array.isArray(contactRaw) ? contactRaw[0] : contactRaw;
    const contactName = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') : 'the contact';

    // 2. ALL active knowledge documents for this org — automatic inclusion,
    // no manual selection, per the "small enough to just send it all" decision.
    const { data: docs, error: docsError } = await supabase
      .from('knowledge_documents')
      .select('title, category, content')
      .eq('organisation_id', rel.organisation_id)
      .eq('is_active', true);
    if (docsError) throw new Error(`Failed to load knowledge documents: ${docsError.message}`);

    const knowledgeBlock = (docs || [])
      .map((d: any) => `### ${d.title} (${d.category})\n${d.content}`)
      .join('\n\n---\n\n');

    // 3. Recent history for conversational continuity (last 10 events,
    // chronological order — same message_date-based ordering as the
    // History panel, for the same reason: created_at can be misleading
    // for bulk-imported history).
    const { data: historyRaw } = await supabase
      .from('relationship_events')
      .select('direction, channel, message_text, message_date')
      .eq('relationship_id', relationshipId)
      .order('message_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(10);

    const history = (historyRaw || []).slice().reverse();
    const historyBlock = history.length
      ? history
          .map((h: any) => `[${h.message_date || 'no date'}] ${h.direction === 'Sent' ? 'You' : contactName}: ${h.message_text}`)
          .join('\n')
      : '(no prior history logged)';

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Server misconfiguration: OPENAI_API_KEY not set.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const prompt = `You are drafting a reply on behalf of the owner of a B2B relationship intelligence system, in their exact voice, grounded in their real organizational knowledge below. Do not sound like a generic AI assistant — sound like the specific institutional operator described in the Executive Voice framework.

=== ORGANIZATIONAL KNOWLEDGE ===
${knowledgeBlock}

=== RELATIONSHIP CONTEXT ===
Contact: ${contactName}
Company: ${rel.company || 'Unknown'}
Position: ${rel.position || 'Unknown'}
Relationship goal: ${rel.goal}
Relationship stage: ${rel.stage}
Persona: ${rel.persona || 'Unknown'}

=== RECENT CONVERSATION HISTORY (chronological) ===
${historyBlock}

=== THE MESSAGE THEY JUST SENT, THAT NEEDS A REPLY ===
"""
${incomingMessage}
"""
${userGuidance ? `\n=== ADDITIONAL GUIDANCE FROM THE OWNER FOR THIS SPECIFIC REPLY ===\n${userGuidance}\n` : ''}

Write a reply that:
- Matches the Executive Voice framework's tone exactly (calm, structured, institutional — never desperate, never overly friendly, never generic)
- Respects the relationship's current stage — do not push commercial or product discussion if the relationship is still in an early trust-building stage
- Uses the company profile and sales playbook for accurate positioning and objection handling where relevant
- Is ready to send as-is, with no placeholder brackets
- Does NOT include any sign-off, signature, name, or title at the end (e.g. no "Best regards, [Name]" or similar). End the reply after the last substantive sentence. The signature/closing is added separately, per-channel, by the person sending it — not by you.

Return ONLY valid JSON, no markdown fences, in exactly this shape:
{
  "reply": "the full reply text, ready to send",
  "reasoning": "1-2 sentences on why this approach was chosen, referencing the stage, goal, or voice framework"
}`;

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: draftModel,
        temperature: 0.4,
        max_tokens: 1200,
        messages: [
          { role: 'system', content: 'You write replies in the exact voice and context provided. Always return valid JSON only, nothing else.' },
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
