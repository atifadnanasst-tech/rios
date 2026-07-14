// Shared core logic for recomputing a relationship's next_best_action,
// next_touch_due, temperature/status correction, and extracted memory
// facts. Extracted from what used to be an HTTP-only Edge Function so
// daily-relationship-sweep can call it directly, in-process, instead of
// invoking it over the network per relationship.
//
// Why this exists: Supabase enforces a per-trace invocation budget when
// one Edge Function calls another via fetch()/functions.invoke() — every
// downstream call from a single parent execution shares ONE limited
// budget, and once it's exhausted, ALL further calls from that same
// execution are throttled, permanently, no matter how long you wait
// (confirmed via Supabase's own troubleshooting docs, and via a real test
// that hit a hard wall at the same count every run). The documented fix
// is to eliminate the cross-function network call entirely by sharing
// the logic directly — which is what this file does.

export type RecomputeResult = {
  nextBestAction: string | null;
  nextBestActionDraft: string | null;
  nextTouchDue: string | null;
  classification: string | null;
  correctedTemperature: string | null;
  suggestedStage: string | null;
  extractedFactsCount: number;
  trigger: string;
};

const VALID_CLASSIFICATIONS = ['Positive', 'Neutral', 'Negative', 'Info_Request', 'Not_Interested', 'Bounced'];
const VALID_STAGES = [
  'Discovered', 'Connected', 'Recognized', 'Rapport', 'Trust', 'Business Context',
  'Need Identified', 'Solution Alignment', 'Commercial Interest', 'Meeting', 'RFQ',
  'Quotation', 'Negotiation', 'Purchase Order', 'Execution', 'Repeat Business',
  'Strategic Partner', 'Advocate',
];

export async function runRecompute(
  supabase: any,
  relationshipId: string,
  trigger: string,
  openaiApiKey: string,
  model = 'gpt-4o-mini'
): Promise<RecomputeResult> {
  // 1. Relationship + contact context
  const { data: rel, error: relError } = await supabase
    .from('relationships')
    .select('id, organisation_id, goal, stage, company, position, persona, relationship_temperature, outreach_status, contacts(first_name, last_name)')
    .eq('id', relationshipId)
    .single();
  if (relError || !rel) {
    throw new Error('Relationship not found.');
  }

  const contactRaw = (rel as any).contacts;
  const contact = Array.isArray(contactRaw) ? contactRaw[0] : contactRaw;
  const contactName = contact ? [contact.first_name, contact.last_name].filter(Boolean).join(' ') : 'the contact';

  // 2. Last 50 events, chronological
  const { data: historyRaw } = await supabase
    .from('relationship_events')
    .select('direction, channel, message_text, message_date, event_type, created_at')
    .eq('relationship_id', relationshipId)
    .order('message_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(50);
  const history = (historyRaw || []).slice().reverse();
  const historyBlock = history.length
    ? history
        .filter((h: any) => h.event_type === 'message_sent' || h.event_type === 'message_received')
        .map((h: any) => `[${h.message_date || 'no date'}] ${h.direction === 'Sent' ? 'You' : contactName}: ${h.message_text}`)
        .join('\n')
    : '(no history logged yet)';

  // 3. Existing memory facts
  const { data: existingMemoryRaw } = await supabase
    .from('relationship_memory')
    .select('fact_type, value')
    .eq('relationship_id', relationshipId)
    .is('superseded_by', null);
  const existingMemoryBlock = (existingMemoryRaw || []).length
    ? existingMemoryRaw!.map((m: any) => `- (${m.fact_type}) ${m.value}`).join('\n')
    : '(no facts recorded yet)';

  // 4. All active knowledge documents
  const { data: docs, error: docsError } = await supabase
    .from('knowledge_documents')
    .select('title, category, content')
    .eq('organisation_id', rel.organisation_id)
    .eq('is_active', true);
  if (docsError) throw new Error(`Failed to load knowledge documents: ${docsError.message}`);
  const knowledgeBlock = (docs || []).map((d: any) => `### ${d.title} (${d.category})\n${d.content}`).join('\n\n---\n\n');

  const todayStr = new Date().toISOString().slice(0, 10);

  const prompt = `You are re-evaluating a business relationship for a relationship intelligence system. Your job is to determine, GIVEN EVERYTHING THAT HAS ACTUALLY HAPPENED, what the owner should do next and when — not to guess or invent.

For reference, today's actual date is ${todayStr}.

=== ORGANIZATIONAL KNOWLEDGE ===
${knowledgeBlock}

=== RELATIONSHIP CONTEXT ===
Contact: ${contactName}
Company: ${rel.company || 'Unknown'}
Position: ${rel.position || 'Unknown'}
Goal: ${rel.goal}
Current stage: ${rel.stage}
Current temperature: ${rel.relationship_temperature}
Current outreach status: ${rel.outreach_status}

=== ALREADY-KNOWN FACTS ABOUT THIS RELATIONSHIP (do not re-extract these) ===
${existingMemoryBlock}

=== FULL MESSAGE HISTORY (chronological, up to last 50 events) ===
${historyBlock}

=== YOUR TASK ===
1. next_best_action: ONE concrete, specific action the owner should take next, in plain language, grounded in the actual history and the organizational knowledge above. Not generic ("follow up") — specific to what's actually happened ("Send the SFP transceiver pricing sheet she asked about on the 25th"). If the history shows the contact has explicitly asked not to be contacted, this must say so plainly (e.g. "Do not contact — they requested removal from outreach") rather than suggesting further outreach.
2. next_best_action_draft: when — and only when — next_best_action genuinely means "send this contact a message," write the actual, ready-to-send message text itself (no placeholder brackets, no sign-off/signature — those are added separately, per-channel, by the owner). If next_best_action is NOT a send-a-message action (e.g. "Do not contact", "Wait for their reply before proceeding", "Prepare an internal quotation first"), return null here — do not force a draft where one doesn't belong.
3. next_touch_due: a real date in YYYY-MM-DD format for when this action should happen. If the history contains an explicit timing signal (e.g. "I'll revert next week", "let's talk after the holidays"), compute the date from that relative to ${todayStr}. If there's no explicit signal, use a sensible default based on temperature and stage (Hot/recently engaged = sooner, e.g. 3-5 days; Cold/early stage = further out, e.g. 14-21 days). Never return a date in the past.
4. extracted_facts: an array of genuinely NEW facts learned from the history that aren't already in the known-facts list above — concrete, useful things like project mentions, stated preferences, decision-maker identification, competitor mentions, timelines. Return an empty array if there's nothing new. Each fact needs a short fact_type (e.g. "project_mention", "preference", "decision_maker", "timeline") and a value (the fact itself, one sentence).
5. classification: based on the MOST RECENT message from the contact (not from the owner), EXACTLY one of these six words: Positive, Neutral, Negative, Info_Request, Not_Interested, Bounced. This is used to correct the relationship's temperature — a naive rule-based system may have already set temperature incorrectly (e.g. treating "please do not contact me" as positive engagement just because a reply arrived) and this classification is what corrects that. If there is NO message from the contact anywhere in the history (a first-touch candidate who has never actually replied), return null for this field — do not invent a classification, and do not suggest a temperature/status change, since nothing has actually happened yet to justify one.
6. suggested_stage: if — AND ONLY IF — the history contains a genuinely strong, explicit signal that this relationship has clearly moved to a new stage (e.g. "let's schedule a call" → Meeting, "please send the contract" → Negotiation, "can you send a quotation" → Quotation), return that exact stage name from this list: Discovered, Connected, Recognized, Rapport, Trust, Business Context, Need Identified, Solution Alignment, Commercial Interest, Meeting, RFQ, Quotation, Negotiation, Purchase Order, Execution, Repeat Business, Strategic Partner, Advocate. This is a SUGGESTION shown to the owner for their approval, never applied automatically — so it is fine, and expected, to return null far more often than not. Only suggest a stage that is a clear forward step from the current stage (never suggest backward, and never suggest the same stage the relationship is already at). If there is no strong, explicit signal, return null — do not guess or suggest a minor/ambiguous advance.

Return ONLY valid JSON, no markdown fences, in exactly this shape:
{
  "next_best_action": "...",
  "next_best_action_draft": "..." or null,
  "next_touch_due": "YYYY-MM-DD",
  "extracted_facts": [{"fact_type": "...", "value": "..."}],
  "classification": "..." or null,
  "suggested_stage": "..." or null
}`;

  const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: model,
      temperature: 0.3,
      max_tokens: 1000,
      messages: [
        { role: 'system', content: 'You re-evaluate relationship status from real history only. Always return valid JSON only, nothing else.' },
        { role: 'user', content: prompt },
      ],
    }),
  });

  if (!openaiResponse.ok) {
    const errText = await openaiResponse.text();
    throw new Error(`OpenAI request failed: ${errText}`);
  }

  const data = await openaiResponse.json();
  const raw = data.choices?.[0]?.message?.content?.trim() || '';
  const cleaned = raw.replace(/^```json?\s*/i, '').replace(/```$/, '').trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Model did not return valid JSON: ${raw}`);
  }

  // Sanity-guard the date — never trust it blindly.
  let safeDueDate: string | null = null;
  if (parsed.next_touch_due) {
    const d = new Date(parsed.next_touch_due);
    const today = new Date(todayStr);
    if (!isNaN(d.getTime()) && d >= today) {
      safeDueDate = parsed.next_touch_due;
    }
  }

  const classification = VALID_CLASSIFICATIONS.includes(parsed.classification) ? parsed.classification : null;

  let correctedTemperature: string | null = null;
  let correctedStatus: string | null = null;
  if (classification === 'Positive' || classification === 'Info_Request') {
    correctedTemperature = 'Hot';
  } else if (classification === 'Negative' || classification === 'Not_Interested') {
    correctedTemperature = 'Cold';
  }
  if (classification === 'Not_Interested') {
    correctedStatus = 'opted_out';
  }

  // Only accept a stage suggestion that's genuinely a forward step from
  // where the relationship actually is right now — never backward, never
  // the same stage, and only from the real, valid stage list. This is a
  // suggestion for the owner to approve, never applied automatically.
  let suggestedStage: string | null = null;
  if (VALID_STAGES.includes(parsed.suggested_stage)) {
    const currentIdx = VALID_STAGES.indexOf(rel.stage);
    const suggestedIdx = VALID_STAGES.indexOf(parsed.suggested_stage);
    if (suggestedIdx > currentIdx) {
      suggestedStage = parsed.suggested_stage;
    }
  }

  const { error: updateError } = await supabase
    .from('relationships')
    .update({
      next_best_action: parsed.next_best_action || null,
      next_best_action_draft: parsed.next_best_action_draft || null,
      ...(safeDueDate ? { next_touch_due: safeDueDate } : {}),
      ...(correctedTemperature ? { relationship_temperature: correctedTemperature } : {}),
      ...(correctedStatus ? { outreach_status: correctedStatus } : {}),
      ...(classification ? { last_reply_classification: classification } : {}),
      suggested_stage: suggestedStage, // explicitly overwrite each time, including back to null if no longer justified
    })
    .eq('id', relationshipId);
  if (updateError) throw new Error(`Failed to update relationship: ${updateError.message}`);

  const facts = Array.isArray(parsed.extracted_facts) ? parsed.extracted_facts : [];
  if (facts.length > 0) {
    const memoryRows = facts
      .filter((f: any) => f && f.fact_type && f.value)
      .map((f: any) => ({
        relationship_id: relationshipId,
        fact_type: f.fact_type,
        value: f.value,
        confidence: 'Medium',
        source: 'ai_research',
      }));
    if (memoryRows.length > 0) {
      const { error: memoryError } = await supabase.from('relationship_memory').insert(memoryRows);
      if (memoryError) console.error('Failed to save extracted facts:', memoryError.message);
    }
  }

  return {
    nextBestAction: parsed.next_best_action || null,
    nextBestActionDraft: parsed.next_best_action_draft || null,
    nextTouchDue: safeDueDate,
    classification,
    correctedTemperature,
    suggestedStage,
    extractedFactsCount: facts.length,
    trigger,
  };
}
