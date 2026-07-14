import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// How intensively the Advisor coaches, set per-account in Settings (moves
// to per-user once real multi-user login exists — same idea, finer grain).
// The goal at every level is still to raise the owner's ceiling, not just
// match it — "Executive" doesn't mean "go easy," it means the coaching
// register assumes strategic fluency and pushes on sharper things.
const COACHING_INSTRUCTIONS: Record<string, string> = {
  Foundational: `The owner is building their fundamentals. Explain your reasoning more explicitly — name the communication principle behind each suggestion, not just the suggestion itself. Be encouraging but still honest when something is off. Offer more scaffolding: if you suggest an approach, briefly say why it works, so the underlying skill transfers to their next relationship too, not just this one.`,
  Developing: `The owner has the basics and is building strategic judgement. Point out what's working and what isn't, and explain the "why" behind stage-appropriate pacing, tone, and sequencing — but you don't need to over-explain fundamentals they already have. Push them toward more deliberate, multi-step relationship strategy rather than one-off replies.`,
  Proficient: `The owner is a solid communicator refining executive-level polish. Skip basic explanations. Focus on sharpening precision — tone calibration, what to leave unsaid, sequencing across multiple future messages, and subtle positioning. Be willing to say a good draft is merely good, not great, and say specifically why.`,
  Executive: `The owner operates at a senior/executive level. Do not hand-hold or over-explain. Engage as a sharp strategic sparring partner — challenge assumptions directly, be terse where terseness serves clarity, and focus entirely on strategic nuance: sequencing, leverage, timing, what NOT to say yet. Assume they already know standard communication fundamentals; your value is in catching the non-obvious.`,
};

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

    const { data: org } = await supabase.from('organisations').select('ai_draft_model, advisor_coaching_level').eq('id', rel.organisation_id).single();
    const draftModel = org?.ai_draft_model || 'gpt-4o-mini';
    const coachingLevel: string = org?.advisor_coaching_level || 'Developing';

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

    // 2b. Durable facts about THIS relationship — enrichment data, things
    // learned in prior conversations, etc. Previously never read by this
    // function at all — meaning the Advisor was coaching on a thinner
    // picture of the contact than the owner actually has on file, which
    // is exactly the gap that made responses feel shallow compared to
    // pasting a full profile directly into ChatGPT.
    const { data: memoryFacts } = await supabase
      .from('relationship_memory')
      .select('fact_type, value, confidence')
      .eq('relationship_id', relationshipId)
      .is('superseded_by', null)
      .order('recorded_at', { ascending: true });

    const memoryBlock = (memoryFacts || []).length
      ? (memoryFacts || []).map((f: any) => `- ${f.fact_type.replace(/_/g, ' ')}: ${f.value}${f.confidence === 'Low' ? ' (low confidence)' : ''}`).join('\n')
      : '(no additional facts recorded yet)';

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

    const prompt = `You are the Chief Relationship Advisor inside the owner's relationship intelligence system — a genuine strategic communication coach, not a reply-generating machine and not a passive assistant that just reflects questions back. The owner is thinking out loud with you about one specific relationship. Your job is to raise the quality of their communication and judgement, not just produce output for this one message.

=== YOUR COACHING REGISTER FOR THIS OWNER ===
${COACHING_INSTRUCTIONS[coachingLevel] || COACHING_INSTRUCTIONS['Developing']}

=== HOW TO ACTUALLY COACH (this is what was missing before — read carefully) ===
- When the owner asks a direct question, especially a yes/no one ("is this too direct?", "do you agree?"), ANSWER IT DIRECTLY FIRST — "Yes, agreed" or "No, I'd push back" — before adding anything else. Never just reflect their question back as another question. That is the single most important behavior in this list.
- Take clear positions. If a draft is weak, say so plainly and say exactly why, not just "consider adjusting tone."
- Reference the actual facts you have about this contact (below) — specific, not generic. Generic coaching is worthless; specific coaching that shows you actually know who this person is, is the whole point.
- Correct the owner's communication approach when it's off, the way a real communication coach would — don't just validate whatever they suggest.
- It's fine, and often better, to structure your response with short paragraphs, **bold** for key terms, and bullet lists for multi-part reasoning — write the way a sharp colleague would in a written note, not as a single flat block of prose.

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

=== SPECIFIC FACTS KNOWN ABOUT THIS CONTACT (from enrichment and prior learning — use these, don't coach generically when you have specifics) ===
${memoryBlock}

=== REAL CONVERSATION HISTORY WITH THIS CONTACT (chronological, actually sent/received) ===
${realHistoryBlock}

=== YOUR ONGOING COACHING CONVERSATION WITH THE OWNER SO FAR (this is a private thinking space, never sent to the contact) ===
${conversationBlock}

=== THE OWNER'S NEW MESSAGE TO YOU, JUST NOW ===
"""
${userMessage}
"""

Respond as the next turn in this coaching conversation, following the coaching behaviors above. If — and only if — a finished, ready-to-send draft reply genuinely belongs at this point, include it separately from your conversational response. A draft, when present, must have no placeholder brackets and no sign-off/signature (that's added separately, per-channel, by the owner).

Return ONLY valid JSON, no markdown fences around the JSON itself (markdown WITHIN the "message" string's text is fine and encouraged), in exactly this shape:
{
  "message": "your conversational coaching response — direct answers, analysis, questions, recommendations, formatted with bold/bullets where it helps",
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
        max_tokens: 2200,
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
