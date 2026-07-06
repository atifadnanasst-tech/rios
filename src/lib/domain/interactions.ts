import { supabase } from '../supabaseClient';

export type LogInteractionInput = {
  relationshipId: string;
  direction: 'Sent' | 'Received';
  channel: 'LinkedIn' | 'Email' | 'WhatsApp' | 'Phone';
  messageDate: string; // YYYY-MM-DD
  messageText: string;
};

const TEMPERATURE_ORDER: Array<'Cold' | 'Warm' | 'Hot'> = ['Cold', 'Warm', 'Hot'];

// Deterministic v1: no AI classification of sentiment here. A received
// message advances temperature one step and speeds up the next touch;
// a sent message just records the touch and pushes the next one out.
// This is exactly the kind of rule-based logic the Constitution says
// belongs in code, not in an AI call — replace with real classification
// later without changing where this function is called from.
const DAYS_UNTIL_NEXT_TOUCH_AFTER_SENT = 14;
const DAYS_UNTIL_NEXT_TOUCH_AFTER_RECEIVED = 3;

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function logInteraction(input: LogInteractionInput): Promise<void> {
  const { relationshipId, direction, channel, messageDate, messageText } = input;

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
    .select('touch_number, relationship_temperature, outreach_status')
    .eq('id', relationshipId)
    .single();
  if (readError) throw new Error(`Failed to read relationship before update: ${readError.message}`);

  if (direction === 'Sent') {
    const { error } = await supabase
      .from('relationships')
      .update({
        last_outreach_date: messageDate,
        last_outreach_channel: channel,
        touch_number: (current.touch_number || 0) + 1,
        next_touch_due: addDays(messageDate, DAYS_UNTIL_NEXT_TOUCH_AFTER_SENT),
      })
      .eq('id', relationshipId);
    if (error) throw new Error(`Failed to update relationship: ${error.message}`);
  } else {
    const currentTempIndex = TEMPERATURE_ORDER.indexOf(current.relationship_temperature as any);
    const nextTemp = TEMPERATURE_ORDER[Math.min(currentTempIndex + 1, TEMPERATURE_ORDER.length - 1)];

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
  }
}
