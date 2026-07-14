// Single source of truth for the deterministic, zero-AI follow-up
// cadence: 7 → 15 → 21 → 30 → 45 days, getting longer the more times
// someone's been touched without a reply. This used to be duplicated
// across three separate places (Log Interaction, bulk Outreach, Import
// Interactions) — one had the correct schedule, one had a flat 14-day
// placeholder that never advanced, and one didn't set a date at all.
// One shared function now, so there's only one place to ever fix again.
export const CADENCE_SCHEDULE_DAYS = [7, 15, 21, 30, 45];

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Given the relationship's current cadence_step and the date of the sent
// message just logged, returns the next step and the date the following
// follow-up should happen. Clamps at the schedule's longest interval
// (45 days) once it's been exhausted, rather than going out of bounds.
export function advanceCadence(
  currentStep: number,
  fromDateStr: string
): { nextTouchDue: string; cadenceStep: number } {
  const step = currentStep || 0;
  const days = CADENCE_SCHEDULE_DAYS[Math.min(step, CADENCE_SCHEDULE_DAYS.length - 1)];
  return {
    nextTouchDue: addDays(fromDateStr, days),
    cadenceStep: step + 1,
  };
}
