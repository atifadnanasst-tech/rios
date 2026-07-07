import { supabase } from '../supabaseClient';

export type ReplySuggestion = {
  reply: string;
  reasoning: string;
};

export async function getReplySuggestion(
  relationshipId: string,
  incomingMessage: string,
  userGuidance?: string
): Promise<ReplySuggestion> {
  const { data, error } = await supabase.functions.invoke('reply-assistant', {
    body: { relationshipId, incomingMessage, userGuidance: userGuidance || undefined },
  });
  if (error) throw new Error(`Reply Assistant failed: ${error.message}`);
  if (data?.error) throw new Error(data.error);
  return data as ReplySuggestion;
}
