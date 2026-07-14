import { supabase } from '../supabaseClient';

// Wraps supabase.functions.invoke with proper error surfacing.
//
// The problem this fixes: when an Edge Function returns a non-2xx status,
// Supabase's own error.message is a generic placeholder — literally
// "Edge Function returned a non-2xx status code" — even though our own
// functions already try to return a specific, useful reason in their
// response body (e.g. "OpenAI request failed: ...", "Model did not
// return valid JSON"). That real reason was being silently discarded,
// so every failure looked identical and unhelpful regardless of cause.
// This reads the actual response body when available, so the person
// actually sees what went wrong instead of a message that hides it.
export async function invokeEdgeFunction<T = any>(
  functionName: string,
  body: Record<string, any>
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(functionName, { body });

  if (error) {
    let detail = error.message;
    try {
      const context = (error as any).context;
      if (context && typeof context.json === 'function') {
        const responseBody = await context.json();
        if (responseBody?.error) detail = responseBody.error;
      }
    } catch {
      // context wasn't readable/JSON — fall back to the generic message
      // rather than let this secondary failure mask the original one.
    }
    throw new Error(detail);
  }

  // Some functions return 200 with an { error: "..." } body instead of a
  // non-2xx status — still needs to be treated as a real failure.
  if (data?.error) throw new Error(data.error);

  return data as T;
}
