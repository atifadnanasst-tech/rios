import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { runRecompute } from '../_shared/recomputeCore.ts';

// Temperature tier for sorting — lower number = higher priority.
const TIER_RANK: Record<string, number> = { Hot: 1, Warm: 2, Cold: 3 };

// How many recompute calls to run concurrently per batch. Now that this
// calls runRecompute() directly in-process (no cross-function invocation,
// no Supabase per-trace budget to worry about), the only real ceiling is
// OpenAI's own rate limits — kept modest and conservative regardless.
const BATCH_SIZE = 5;

type CandidateRow = {
  id: string;
  relationship_temperature: string;
  last_reply_date: string | null;
  last_outreach_date: string | null;
  icp_score: number;
};

function isWaitingForYou(row: CandidateRow): boolean {
  if (!row.last_reply_date) return false;
  if (!row.last_outreach_date) return true;
  return new Date(row.last_reply_date) > new Date(row.last_outreach_date);
}

function sortByPriority(rows: CandidateRow[]): CandidateRow[] {
  return [...rows].sort((a, b) => {
    const aWaiting = isWaitingForYou(a) ? 0 : 1;
    const bWaiting = isWaitingForYou(b) ? 0 : 1;
    if (aWaiting !== bWaiting) return aWaiting - bWaiting;

    const aTier = TIER_RANK[a.relationship_temperature] ?? 4;
    const bTier = TIER_RANK[b.relationship_temperature] ?? 4;
    if (aTier !== bTier) return aTier - bTier;

    return b.icp_score - a.icp_score;
  });
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const today = new Date().toISOString().slice(0, 10);
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!;

  // Calls the shared logic directly, in-process — NOT via fetch() to the
  // other Edge Function. That HTTP-based design previously hit a hard
  // wall at the same count every run ("Rate limit exceeded for trace...")
  // — confirmed via Supabase's own docs to be a per-trace invocation
  // budget shared by every downstream call from one parent execution,
  // which does not reset by waiting. Calling the logic directly
  // eliminates the problem at its root instead of working around it.
  async function recompute(relationshipId: string): Promise<{ id: string; ok: boolean; error?: string }> {
    try {
      await runRecompute(supabase, relationshipId, 'cron', openaiApiKey);
      return { id: relationshipId, ok: true };
    } catch (err) {
      return { id: relationshipId, ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async function processBatched(label: string, ids: string[]): Promise<{ ok: number; failed: number }> {
    let ok = 0;
    let failed = 0;
    const batches = chunk(ids, BATCH_SIZE);
    console.log(`[${label}] Starting: ${ids.length} candidates in ${batches.length} batch(es) of up to ${BATCH_SIZE}.`);

    for (let i = 0; i < batches.length; i++) {
      const results = await Promise.allSettled(batches[i].map((id) => recompute(id)));
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.ok) {
          ok++;
        } else {
          failed++;
          const detail = r.status === 'fulfilled' ? r.value.error : String(r.reason);
          console.error(`[${label}] Failed:`, detail);
        }
      }
      console.log(`[${label}] Batch ${i + 1}/${batches.length} done — running total: ${ok} ok, ${failed} failed.`);
    }
    return { ok, failed };
  }

  async function runSweep() {
    try {
      const { data: orgs, error: orgsError } = await supabase
        .from('organisations')
        .select('id, daily_new_touch_cap, daily_sweep_hour_utc, daily_sweep_minute_utc, daily_sweep_last_run_date');
      if (orgsError) throw new Error(`Failed to load organisations: ${orgsError.message}`);

      console.log(`Sweep starting for ${today} — ${(orgs || []).length} organisation(s).`);

      let totalFollowUpsOk = 0;
      let totalNewTouchesOk = 0;
      let totalFailed = 0;

      for (const org of orgs || []) {
        // This function is meant to be scheduled frequently (e.g. every
        // 15 minutes) via pg_cron — the FIXED schedule never needs to
        // change. What actually varies per organisation is this gate:
        // only do real work once, at the configured hour, once per day.
        // Changing daily_sweep_hour_utc later (e.g. from a future
        // Settings screen) takes effect immediately, with zero need to
        // ever touch the pg_cron schedule itself again.
        const currentUtcHour = new Date().getUTCHours();
        const currentUtcMinute = new Date().getUTCMinutes();
        const alreadyRanToday = org.daily_sweep_last_run_date === today;
        if (
          currentUtcHour !== org.daily_sweep_hour_utc ||
          currentUtcMinute !== org.daily_sweep_minute_utc ||
          alreadyRanToday
        ) {
          continue;
        }

        const baseFilter = supabase
          .from('relationships')
          .select('id, relationship_temperature, last_reply_date, last_outreach_date, icp_score, touch_number, next_touch_due, archived_at, excluded_until, outreach_status')
          .eq('organisation_id', org.id)
          .not('outreach_status', 'in', '("opted_out","do_not_contact")')
          .is('archived_at', null)
          .or(`excluded_until.is.null,excluded_until.lte.${today}`);

        const { data: followUpsRaw, error: followUpsError } = await baseFilter
          .lte('next_touch_due', today)
          .gt('touch_number', 0);
        if (followUpsError) {
          console.error(`Follow-up query failed for org ${org.id}:`, followUpsError.message);
        }

        const sortedFollowUps = sortByPriority((followUpsRaw || []) as CandidateRow[]);
        const followUpResult = await processBatched('follow-ups', sortedFollowUps.map((r) => r.id));
        totalFollowUpsOk += followUpResult.ok;
        totalFailed += followUpResult.failed;

        const { data: freshRaw, error: freshError } = await supabase
          .from('relationships')
          .select('id, icp_score')
          .eq('organisation_id', org.id)
          .eq('touch_number', 0)
          .not('outreach_status', 'in', '("opted_out","do_not_contact")')
          .is('archived_at', null)
          .or(`excluded_until.is.null,excluded_until.lte.${today}`)
          .order('icp_score', { ascending: false })
          .limit(org.daily_new_touch_cap);
        if (freshError) {
          console.error(`Fresh-candidate query failed for org ${org.id}:`, freshError.message);
        }

        const freshResult = await processBatched('new-touches', (freshRaw || []).map((r) => r.id));
        totalNewTouchesOk += freshResult.ok;
        totalFailed += freshResult.failed;

        // Mark this org as done for today — otherwise the next 15-minute
        // check, still within the same matching hour, would run it again.
        const { error: markError } = await supabase
          .from('organisations')
          .update({ daily_sweep_last_run_date: today })
          .eq('id', org.id);
        if (markError) console.error(`Failed to mark org ${org.id} as swept today:`, markError.message);
      }

      console.log(
        `Sweep complete for ${today}: ${totalFollowUpsOk} follow-ups, ${totalNewTouchesOk} new touches, ${totalFailed} failed.`
      );
    } catch (err) {
      console.error('Sweep failed with an unexpected error:', err instanceof Error ? err.message : err);
    }
  }

  // @ts-ignore — EdgeRuntime is a Supabase-provided global, not a standard Deno type
  EdgeRuntime.waitUntil(runSweep());

  return new Response(
    JSON.stringify({ status: 'started', date: today, note: 'Processing in background — watch the Logs tab for per-batch progress.' }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});
