import { createClient } from 'jsr:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { runRecompute } from '../_shared/recomputeCore.ts';

// Thin HTTP wrapper around the shared recompute logic — needed here for
// the frontend's on-demand single-relationship calls (right after logging
// a reply). daily-relationship-sweep calls runRecompute() directly
// in-process instead of invoking this function, to avoid Supabase's
// per-trace invocation budget entirely — see recomputeCore.ts for why.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { relationshipId, trigger } = await req.json();

    if (!relationshipId) {
      return new Response(JSON.stringify({ error: 'relationshipId is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Server misconfiguration: OPENAI_API_KEY not set.' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: rel } = await supabase
      .from('relationships')
      .select('organisation_id')
      .eq('id', relationshipId)
      .single();

    const { data: org } = await supabase
      .from('organisations')
      .select('ai_analysis_model')
      .eq('id', rel?.organisation_id)
      .single();

    const analysisModel = org?.ai_analysis_model || 'gpt-4o-mini';
    const result = await runRecompute(supabase, relationshipId, trigger || 'manual', apiKey, analysisModel);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
