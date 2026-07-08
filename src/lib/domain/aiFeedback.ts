import { supabase } from '../supabaseClient';

export type AiFeedbackInput = {
  relationshipId: string;
  feedbackType: 'reply_edited' | 'guidance_given';
  aiOutput?: string | null;
  userCorrection: string;
};

// Fire-and-forget, same as the recompute trigger — capturing feedback
// should never block or fail the actual save/send action it's attached to.
// This only CAPTURES signals for now; nothing reads or acts on this table
// yet — that's the next, separate decision once there's real data to learn from.
export function recordAiFeedback(input: AiFeedbackInput): void {
  supabase
    .from('ai_feedback')
    .insert({
      relationship_id: input.relationshipId,
      feedback_type: input.feedbackType,
      ai_output: input.aiOutput ?? null,
      user_correction: input.userCorrection,
    })
    .then(({ error }) => {
      if (error) console.error('Failed to record AI feedback:', error.message);
    });
}
