import { supabase } from '../supabaseClient';

export type ParsedMessage = {
  direction: 'Sent' | 'Received';
  date: string | null;
  channel: 'LinkedIn' | 'Email' | 'WhatsApp' | 'Phone' | null;
  text: string;
};

export type ParsedConversation = {
  messages: ParsedMessage[];
  overallClassification: string | null;
  overallBuyingStage: string | null;
  summary: string;
};

export async function parseConversationWithAI(contactName: string, rawText: string): Promise<ParsedConversation> {
  const { data: org } = await supabase.from('organisations').select('ai_analysis_model').limit(1).single();
  const analysisModel = org?.ai_analysis_model || 'gpt-4o-mini';
  const { data, error } = await supabase.functions.invoke('import-interactions', {
    body: { contactName, ownerName: 'Atif', rawText, analysisModel },
  });
  if (error) throw new Error(`AI parsing failed: ${error.message}`);
  if (data?.error) throw new Error(data.error);
  return data as ParsedConversation;
}
