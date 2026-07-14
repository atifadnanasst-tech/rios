import { invokeEdgeFunction } from './invokeFunction';

export type ReplySuggestion = {
  reply: string;
  reasoning: string;
};

export async function getReplySuggestion(
  relationshipId: string,
  incomingMessage: string,
  userGuidance?: string
): Promise<ReplySuggestion> {
  return invokeEdgeFunction<ReplySuggestion>('reply-assistant', {
    relationshipId, incomingMessage, userGuidance: userGuidance || undefined,
  });
}
