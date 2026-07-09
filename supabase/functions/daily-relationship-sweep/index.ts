import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// Daily relationship sweep — pure date-surfacing machine, zero AI calls.
//
// Two funnels per the RIOS cadence model:
//
// Funnel 1 (Cadence): touch > 0 but no recent reply — contacts on a
//   deterministic 7→15→21→30→45 day cadence. The sweep just checks
//   whether their next_touch_due date has arrived and surfaces them.
//   No AI. No recompute. Pure date arithmetic.
//
// Funnel 2 (Conversation): contact replied — AI fires ONCE at reply time
//   (user-triggered via Paste Reply), sets next_touch_due then. The sweep
//   just surfaces them when that date arrives. Again, no cron AI call.
//
// New contacts (touch = 0): selected by ICP tier/score, given
//   next_touch_due = today so they surface in the daily queue. No AI.
//
// This design means the cron costs $0 in API calls, every day.

const CADENCE_DAYS = [7, 15, 21, 30, 45];

function nextCadenceDate(cadenceStep: number): string {
  const days = CADENCE_DAYS[cadenceStep % CADENCE_DAYS.length];
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const today = new Date().toISOString().slice(0, 10);

  async function runSweep() {
    const { data: orgs, error: orgsError } = await supabase
      .from('organisations')
      .select('id, daily_new_touch_cap, daily_sweep_hour_utc, daily_sweep_minute_utc, daily_sweep_last_run_date');
    if (orgsError) { console.error('Failed to load orgs:', orgsError.message); return; }

    for (const org of orgs || []) {
      const currentUtcHour = new Date().getUTCHours();
      const currentUtcMinute = new Date().getUTCMinutes();
      const alreadyRanToday = org.daily_sweep_last_run_date === today;
      if (currentUtcHour !== org.daily_sweep_hour_utc ||
          currentUtcMinute !== org.daily_sweep_minute_utc ||
          alreadyRanToday) continue;

      console.log(`Sweep starting for ${today}, org ${org.id}`);
      let newTouchCount = 0;
      let cadenceCount = 0;

      // ── Funnel 1: cadence contacts whose next_touch_due arrived ──────────
      // These already have their date set from a previous sweep or touch log.
      // Nothing to update — fetchTodaysWorkItems already surfaces them via
      // the `next_touch_due <= today` query. Nothing to do here.
      // We just log the count for visibility.
      const { count: overdueCount } = await supabase
        .from('relationships')
        .select('id', { count: 'exact', head: true })
        .eq('organisation_id', org.id)
        .not('outreach_status', 'in', '("opted_out","do_not_contact")')
        .is('archived_at', null)
        .gt('touch_number', 0)
        .lte('next_touch_due', today);
      cadenceCount = overdueCount || 0;

      // ── New contacts (touch = 0): select top N by ICP, set date = today ──
      const { data: newCandidates, error: newErr } = await supabase
        .from('relationships')
        .select('id')
        .eq('organisation_id', org.id)
        .eq('touch_number', 0)
        .not('outreach_status', 'in', '("opted_out","do_not_contact")')
        .is('archived_at', null)
        .is('next_touch_due', null)
        .order('icp_score', { ascending: false })
        .limit(org.daily_new_touch_cap);

      if (newErr) { console.error('Failed to fetch new candidates:', newErr.message); }

      if (newCandidates && newCandidates.length > 0) {
        const ids = newCandidates.map((r: any) => r.id);
        const { error: updateErr } = await supabase
          .from('relationships')
          .update({ next_touch_due: today })
          .in('id', ids);
        if (updateErr) console.error('Failed to set next_touch_due for new contacts:', updateErr.message);
        else newTouchCount = ids.length;
      }

      // Mark this org as swept today
      await supabase
        .from('organisations')
        .update({ daily_sweep_last_run_date: today })
        .eq('id', org.id);

      console.log(`Sweep complete for ${today}: ${cadenceCount} follow-ups due, ${newTouchCount} new touches selected. Zero AI calls.`);
    }
  }

  // @ts-ignore
  EdgeRuntime.waitUntil(runSweep());

  return new Response(
    JSON.stringify({ status: 'started', date: today, note: 'Zero AI calls — pure date surfacing.' }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
