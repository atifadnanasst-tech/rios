import { createClient } from '@supabase/supabase-js';

// Vite exposes env vars to the browser ONLY if prefixed with VITE_ —
// this is a Vite project, not Next.js, so NEXT_PUBLIC_ prefixes do nothing here.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Add them to .env in the project root and restart `npm run dev`.'
  );
}

// NEVER put the secret key here — this file ships to the browser.
export const supabase = createClient(supabaseUrl, supabasePublishableKey);
