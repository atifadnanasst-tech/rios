import { supabase } from '../supabaseClient';
import { invokeEdgeFunction } from './invokeFunction';

export type AdvisorMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  draftReply: string | null;
  createdAt: string;
};

// Gets (or creates, on first use) the one advisor conversation thread for
// this relationship, and loads every turn so far — this is what makes
// Advisor Chat pick up right where you left it, even days later, instead
// of starting from zero like the single-shot Reply Assistant does.
export async function fetchAdvisorConversation(relationshipId: string): Promise<AdvisorMessage[]> {
  const { data: conversationId, error: convError } = await supabase.rpc('get_or_create_advisor_conversation', {
    p_relationship_id: relationshipId,
  });
  if (convError) throw new Error(`Failed to load advisor conversation: ${convError.message}`);

  const { data, error } = await supabase
    .from('advisor_messages')
    .select('id, role, content, draft_reply, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Failed to load advisor messages: ${error.message}`);

  return (data || []).map((m: any) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    draftReply: m.draft_reply,
    createdAt: m.created_at,
  }));
}

// Sends the owner's message to the Advisor Chat edge function and returns
// the AI's response turn. The edge function itself saves BOTH sides of
// the exchange server-side — this only needs to hand back the assistant's
// reply so the UI can show it immediately.
export async function sendAdvisorMessage(relationshipId: string, userMessage: string): Promise<AdvisorMessage> {
  const data = await invokeEdgeFunction<any>('advisor-chat', { relationshipId, userMessage });
  return {
    id: data.id,
    role: 'assistant',
    content: data.content,
    draftReply: data.draftReply,
    createdAt: data.createdAt,
  };
}
