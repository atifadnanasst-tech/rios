import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// The real, persistent Advisor Chat — a multi-turn coaching conversation
// scoped to one relationship. Unlike reply-assistant (single-shot, no
// memory of prior turns), this loads and saves the conversation's own
// history from advisor_messages, so "no, shorter" on the next turn
// actually builds on what came before, the way a real chat does.
//
// v1 = exactly one thread per relationship, via
// get_or_create_advisor_conversation() (see migration
// 20260713173819_add_advisor_chat.sql) — this function doesn't need to
// know or care about that; it just asks for "the conversation" and gets
// handed the right id either way, so v2 (multiple named threads) only
// ever needs a schema-level change to that function, not this one.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { relationshipId, userMessage } = await req.json();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    if (!relationshipId || !userMessage || typeof userMessage !== 'string' || userMessage.trim().length < 1) {
      return new Response(
        JSON.stringify({ error: 'relationshipId and userMessage are required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Uses the service role — bypasses RLS entirely, safe here because this
    // only ever runs server-side inside the Edge Function, never in the browser.

    // 1. Relationship + contact context — identical shape to reply-assistant
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

    const { data: org } = await supabase.from('organisations').select('ai_draft_model').eq('id', rel.organisation_id).single();
    const draftModel = org?.ai_draft_model || 'gpt-4o-mini';

    const contactRaw = (rel as any).contacts;
    const contact = Array.isArray(contactRaw) ? contactRaw[0] : contactRaw;
    const contactName = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') : 'the contact';

    // 2. ALL active knowledge documents for this org — same as reply-assistant
    const { data: docs, error: docsError } = await supabase
      .from('knowledge_documents')
      .select('title, category, content')
      .eq('organisation_id', rel.organisation_id)
      .eq('is_active', true);
    if (docsError) throw new Error(`Failed to load knowledge documents: ${docsError.message}`);

    const knowledgeBlock = (docs || [])
      .map((d: any) => `### ${d.title} (${d.category})\n${d.content}`)
      .join('\n\n---\n\n');

    // 3. Real interaction history (last 10 events) — same as reply-assistant.
    // This is what was ACTUALLY sent/received with this contact — different
    // from the advisor conversation itself (step 4 below), which is the
    // owner's private thinking-out-loud space, never sent to anyone.
    const { data: historyRaw } = await supabase
      .from('relationship_events')
      .select('direction, channel, message_text, message_date')
      .eq('relationship_id', relationshipId)
      .order('message_date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(10);

    const realHistory = (historyRaw || []).slice().reverse();
    const realHistoryBlock = realHistory.length
      ? realHistory
          .map((h: any) => `[${h.message_date || 'no date'}] ${h.direction === 'Sent' ? 'You' : contactName}: ${h.message_text}`)
          .join('\n')
      : '(no prior history logged)';

    // 4. Get or create this relationship's ONE advisor conversation thread,
    // then load every turn so far — this is what makes it an actual
    // conversation instead of a stateless one-shot call.
    const { data: conversationId, error: convError } = await supabase.rpc('get_or_create_advisor_conversation', {
      p_relationship_id: relationshipId,
    });
    if (convError || !conversationId) {
      throw new Error(`Failed to get/create advisor conversation: ${convError?.message}`);
    }

    const { data: priorMessages, error: msgError } = await supabase
      .from('advisor_messages')
      .select('role, content, draft_reply')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (msgError) throw new Error(`Failed to load advisor conversation history: ${msgError.message}`);

    // Save the owner's new message immediately — happened regardless of
    // whether the AI call below succeeds, same reasoning as reply-assistant
    // logging the incoming message before attempting a draft.
    const { error: saveUserMsgError } = await supabase.from('advisor_messages').insert({
      conversation_id: conversationId,
      role: 'user',
      content: userMessage,
    });
    if (saveUserMsgError) throw new Error(`Failed to save your message: ${saveUserMsgError.message}`);

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Server misconfiguration: OPENAI_API_KEY not set.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const conversationBlock = (priorMessages || []).length
      ? (priorMessages || [])
          .map((m: any) => `${m.role === 'user' ? 'Owner' : 'You (Advisor)'}: ${m.content}${m.draft_reply ? `\n[Draft reply given: "${m.draft_reply}"]` : ''}`)
          .join('\n\n')
      : '(this is the first message in this conversation)';

    const prompt = `You are the Chief Relationship Advisor inside the owner's relationship intelligence system — a strategic coach, not a reply-generating machine. The owner is thinking out loud with you about one specific relationship. Your job is to improve their judgement: challenge weak ideas, ask clarifying questions, point out what the contact's own words/profile suggest, and recommend an approach — the same way a sharp, honest colleague would, grounded in the real organizational knowledge below. Do not sound like a generic AI assistant — sound like the specific institutional operator described in the Executive Voice framework.

Only produce an actual draft reply when the owner has actually asked for one, or the conversation has clearly reached the point of "so what do I actually send" — not automatically on every turn. Plenty of turns should be pure discussion with no draft at all.

=== ORGANIZATIONAL KNOWLEDGE ===
${knowledgeBlock}

=== RELATIONSHIP CONTEXT ===
Contact: ${contactName}
Company: ${rel.company || 'Unknown'}
Position: ${rel.position || 'Unknown'}
Relationship goal: ${rel.goal}
Relationship stage: ${rel.stage}
Persona: ${rel.persona || 'Unknown'}

=== REAL CONVERSATION HISTORY WITH THIS CONTACT (chronological, actually sent/received) ===
${realHistoryBlock}

=== YOUR ONGOING COACHING CONVERSATION WITH THE OWNER SO FAR (this is a private thinking space, never sent to the contact) ===
${conversationBlock}

=== THE OWNER'S NEW MESSAGE TO YOU, JUST NOW ===
"""
${userMessage}
"""

Respond conversationally, as the next turn in this coaching conversation. If — and only if — a finished, ready-to-send draft reply genuinely belongs at this point, include it separately from your conversational response. A draft, when present, must have no placeholder brackets and no sign-off/signature (that's added separately, per-channel, by the owner).

Return ONLY valid JSON, no markdown fences, in exactly this shape:
{
  "message": "your conversational coaching response — analysis, questions, recommendations, whatever fits this turn",
  "draftReply": "a finished draft reply text, OR null if this turn is pure discussion with nothing to send yet"
}`;

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: draftModel,
        temperature: 0.5,
        max_tokens: 1500,
        messages: [
          { role: 'system', content: 'You are a strategic relationship advisor having a real conversation. Always return valid JSON only, nothing else.' },
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

    const assistantMessage: string = parsed.message || '';
    const draftReply: string | null = parsed.draftReply || null;

    // Save the assistant's turn — this is what makes it persist for next
    // time this contact's Advisor Chat is opened.
    const { data: savedAssistantMsg, error: saveAssistantMsgError } = await supabase
      .from('advisor_messages')
      .insert({
        conversation_id: conversationId,
        role: 'assistant',
        content: assistantMessage,
        draft_reply: draftReply,
      })
      .select('id, created_at')
      .single();
    if (saveAssistantMsgError) throw new Error(`Failed to save advisor response: ${saveAssistantMsgError.message}`);

    return new Response(
      JSON.stringify({
        id: savedAssistantMsg.id,
        role: 'assistant',
        content: assistantMessage,
        draftReply,
        createdAt: savedAssistantMsg.created_at,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
