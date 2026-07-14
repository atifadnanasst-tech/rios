import { supabase } from '../supabaseClient';
import { computeNextTemperature } from './temperature';
import { triggerIntelligenceRecompute } from './intelligenceRecompute';
import { advanceCadence } from './cadence';

export type LogInteractionInput = {
  relationshipId: string;
  direction: 'Sent' | 'Received';
  channel: 'LinkedIn' | 'Email' | 'WhatsApp' | 'Phone';
  messageDate: string; // YYYY-MM-DD
  messageText: string;
  onRecomputed?: () => void; // fires once the background AI correction actually lands, for refreshing an open panel
};

// Deterministic v1: no AI classification of sentiment here. A received
// message advances temperature one step and speeds up the next touch;
// a sent message just records the touch and pushes the next one out.
// This is exactly the kind of rule-based logic the Constitution says
// belongs in code, not in an AI call — replace with real classification
// later without changing where this function is called from.
//
// Fixed 2026-07-14: originally a sent message pushed the next touch out
// by a flat 14 days, forever — never matching the documented escalating
// cadence, and never advancing cadence_step. Later consolidated onto the
// same shared advanceCadence() helper now used by every place a sent
// message gets logged (this file, bulk Outreach, Import Interactions) —
// a second, independent copy of this same logic was found with an even
// bigger gap (never set next_touch_due at all), which is exactly the
// kind of drift a single shared function prevents going forward.
const DAYS_UNTIL_NEXT_TOUCH_AFTER_RECEIVED = 3;

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function logInteraction(input: LogInteractionInput): Promise<void> {
  const { relationshipId, direction, channel, messageDate, messageText, onRecomputed } = input;

  // 1. Always log the raw event — this is the permanent, append-only record.
  const { error: eventError } = await supabase.from('relationship_events').insert({
    relationship_id: relationshipId,
    event_type: direction === 'Sent' ? 'message_sent' : 'message_received',
    direction,
    channel,
    message_text: messageText,
    message_date: messageDate,
    source: 'manual',
  });
  if (eventError) throw new Error(`Failed to log interaction: ${eventError.message}`);

  // 2. Read current state before computing the update — needed for
  // touch_number increment and temperature step-up.
  const { data: current, error: readError } = await supabase
    .from('relationships')
    .select('touch_number, relationship_temperature, outreach_status, cadence_step')
    .eq('id', relationshipId)
    .single();
  if (readError) throw new Error(`Failed to read relationship before update: ${readError.message}`);

  if (direction === 'Sent') {
    const { nextTouchDue, cadenceStep } = advanceCadence(current.cadence_step || 0, messageDate);

    const { error } = await supabase
      .from('relationships')
      .update({
        last_outreach_date: messageDate,
        last_outreach_channel: channel,
        touch_number: (current.touch_number || 0) + 1,
        cadence_step: cadenceStep,
        next_touch_due: nextTouchDue,
      })
      .eq('id', relationshipId);
    if (error) throw new Error(`Failed to update relationship: ${error.message}`);
  } else {
    const nextTemp = computeNextTemperature(current.relationship_temperature as any, null);

    const { error } = await supabase
      .from('relationships')
      .update({
        last_reply_date: messageDate,
        outreach_status: 'engaged',
        relationship_temperature: nextTemp,
        next_touch_due: addDays(messageDate, DAYS_UNTIL_NEXT_TOUCH_AFTER_RECEIVED),
      })
      .eq('id', relationshipId);
    if (error) throw new Error(`Failed to update relationship: ${error.message}`);

    // The deterministic temperature step-up above is a safe immediate
    // fallback, but it can't read what the message actually said (that's
    // exactly what caused a real "do not contact" message to stay
    // classified as warming engagement). The recompute engine reads the
    // real content and corrects this shortly after, in the background —
    // onRecomputed fires once that correction actually lands, so an open
    // panel can refresh and show the corrected value instead of the stale
    // optimistic one.
    triggerIntelligenceRecompute(relationshipId, 'reply').then(() => onRecomputed?.());
  }
}
