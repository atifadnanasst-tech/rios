export type Temperature = 'Cold' | 'Warm' | 'Hot';
export type ReplyClassification = 'Positive' | 'Neutral' | 'Negative' | 'Info_Request' | 'Not_Interested' | 'Bounced';

const TEMPERATURE_ORDER: Temperature[] = ['Cold', 'Warm', 'Hot'];

// Single source of truth for "given what just happened, what should the
// temperature become?" This replaced two genuinely inconsistent versions of
// this logic that had drifted apart: logInteraction (Paste Reply) blindly
// warmed on any reply, while bulkInteractions (Import Interactions)
// correctly read the real classification — meaning the exact same negative
// reply could warm a relationship up via one path and cool it down via
// the other. This function is now the only place this decision gets made,
// so it can only ever mean one thing, and can be swapped for something
// smarter (recency/frequency weighting, real V2 territory) later without
// touching any of its callers.
export function computeNextTemperature(
  currentTemperature: Temperature,
  classification: ReplyClassification | null
): Temperature {
  if (classification === 'Positive' || classification === 'Info_Request') {
    return 'Hot';
  }
  if (classification === 'Negative' || classification === 'Not_Interested') {
    return 'Cold';
  }
  // Neutral, Bounced, or no classification at all (Paste Reply doesn't
  // classify) — no strong signal either way. Step up one level rather than
  // jump straight to Hot, since a reply is still some engagement, worth
  // acknowledging, just not a strong positive signal on its own.
  const idx = TEMPERATURE_ORDER.indexOf(currentTemperature);
  return TEMPERATURE_ORDER[Math.min(idx + 1, TEMPERATURE_ORDER.length - 1)];
}
