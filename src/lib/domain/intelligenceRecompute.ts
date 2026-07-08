import { supabase } from '../supabaseClient';

// Callers should NOT await this in their main save flow (that would make
// logging an interaction wait on a real LLM call to finish) — but they
// CAN chain .then()/.catch() onto it to refresh a UI once the correction
// actually lands, rather than guessing at an arbitrary delay.
export function triggerIntelligenceRecompute(
  relationshipId: string,
  trigger: 'reply' | 'cron' = 'reply'
): Promise<void> {
  return supabase.functions
    .invoke('relationship-intelligence-recompute', { body: { relationshipId, trigger } })
    .then(({ error }) => {
      if (error) console.error('Intelligence recompute failed:', error.message);
    })
    .catch((err) => {
      console.error('Intelligence recompute failed:', err);
    });
}
