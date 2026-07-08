import { supabase } from '../supabaseClient';
import type { ParsedConversation } from './importInteractions';
import { computeNextTemperature } from './temperature';
import { triggerIntelligenceRecompute } from './intelligenceRecompute';

const VALID_REPLY_CLASSIFICATION = new Set(['Positive', 'Neutral', 'Negative', 'Info_Request', 'Not_Interested', 'Bounced']);
const VALID_BUYING_SIGNAL_STAGE = new Set(['Awareness', 'Interest', 'Consideration', 'Intent', 'Closed_Won', 'Closed_Lost']);

// Defense in depth: the Edge Function prompt asks for an exact closed set,
// but an LLM will occasionally drift (e.g. returning "Qualification" instead
// of "Consideration"). Rather than let one bad value fail the whole insert,
// silently fall back to null — a missing classification is recoverable,
// a failed import of 5 real messages is not.
function guardReplyClassification(v: string | null): string | null {
  return v && VALID_REPLY_CLASSIFICATION.has(v) ? v : null;
}
function guardBuyingSignalStage(v: string | null): string | null {
  return v && VALID_BUYING_SIGNAL_STAGE.has(v) ? v : null;
}

export async function importParsedConversation(
  relationshipId: string,
  parsed: ParsedConversation,
  onRecomputed?: () => void
): Promise<void> {
  if (!parsed.messages.length) throw new Error('No messages to import.');

  const safeClassification = guardReplyClassification(parsed.overallClassification);
  const safeBuyingStage = guardBuyingSignalStage(parsed.overallBuyingStage);

  // 1. Log every message as its own append-only event — this is the
  // permanent record, regardless of what happens to relationship state below.
  const eventRows = parsed.messages.map((m) => ({
    relationship_id: relationshipId,
    event_type: m.direction === 'Sent' ? 'message_sent' : 'message_received',
    direction: m.direction,
    channel: m.channel,
    message_text: m.text,
    message_date: m.date,
    reply_classification: m.direction === 'Received' ? safeClassification : null,
    buying_signal_stage: safeBuyingStage,
    source: 'ai_import',
  }));
  const { error: eventsError } = await supabase.from('relationship_events').insert(eventRows);
  if (eventsError) throw new Error(`Failed to log imported messages: ${eventsError.message}`);

  // 2. Record the AI's summary as a structured memory fact.
  if (parsed.summary) {
    const { error: memoryError } = await supabase.from('relationship_memory').insert({
      relationship_id: relationshipId,
      fact_type: 'intelligence_note',
      value: parsed.summary,
      confidence: 'Medium',
      source: 'ai_research',
    });
    if (memoryError) throw new Error(`Failed to save memory note: ${memoryError.message}`);
  }

  // 3. Update the relationship's CURRENT status based on the LAST message in
  // the batch only — not once per message, which would compound several
  // status jumps from a single bulk paste into something meaningless.
  const last = parsed.messages[parsed.messages.length - 1];
  const { data: current, error: readError } = await supabase
    .from('relationships')
    .select('touch_number, relationship_temperature')
    .eq('id', relationshipId)
    .single();
  if (readError) throw new Error(`Failed to read relationship before update: ${readError.message}`);

  if (last.direction === 'Sent') {
    const { error } = await supabase
      .from('relationships')
      .update({
        last_outreach_date: last.date,
        last_outreach_channel: last.channel,
        touch_number: (current.touch_number || 0) + 1,
      })
      .eq('id', relationshipId);
    if (error) throw new Error(`Failed to update relationship: ${error.message}`);
  } else {
    // Reuses the same classification → temperature mapping already proven
    // in the original Apps Script (updateMasterFromReply_), now via the
    // one shared computeNextTemperature function instead of duplicated
    // local logic — that duplication had actually drifted out of sync
    // with logInteraction's version until this consolidation.
    const classification = safeClassification;
    const newTemp = computeNextTemperature(current.relationship_temperature as any, classification as any);
    const newStatus =
      classification === 'Not_Interested'
        ? 'opted_out'
        : classification === 'Positive' || classification === 'Info_Request'
        ? 'engaged'
        : null;

    const updatePayload: Record<string, any> = {
      last_reply_date: last.date,
      relationship_temperature: newTemp,
    };
    if (newStatus) updatePayload.outreach_status = newStatus;
    if (classification) updatePayload.last_reply_classification = classification;

    const { error } = await supabase.from('relationships').update(updatePayload).eq('id', relationshipId);
    if (error) throw new Error(`Failed to update relationship: ${error.message}`);

    // This path already classifies correctly (unlike logInteraction's naive
    // step-up), but never touches next_best_action or extracts memory
    // facts — the recompute engine covers both, in the background.
    triggerIntelligenceRecompute(relationshipId, 'reply').then(() => onRecomputed?.());
  }
}
