import { supabase } from '../supabaseClient';
import { logInteraction } from './interactions';

export type SendChannel = 'email' | 'linkedin' | 'whatsapp' | 'phone';

const CHANNEL_TO_DB: Record<SendChannel, 'Email' | 'LinkedIn' | 'WhatsApp' | 'Phone'> = {
  email: 'Email',
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
  phone: 'Phone',
};

export type SendResult = { opened: boolean; reason?: string };

// Opens the appropriate channel with prefilled text where the channel
// actually supports it (mailto: and wa.me both do; LinkedIn has no such
// URL scheme, so we copy the text to the clipboard instead and open their
// profile, matching the same workaround the original Apps Script used).
// Only logs the interaction if the channel actually opened — if we
// couldn't (e.g. no email on file), nothing was actually sent, so nothing
// should be recorded as sent.
export async function sendAndLogMessage(
  relationshipId: string,
  channel: SendChannel,
  messageText: string
): Promise<SendResult> {
  const { data: rel, error } = await supabase
    .from('relationships')
    .select('contacts(email, phone, linkedin_url)')
    .eq('id', relationshipId)
    .single();
  if (error) throw new Error(`Failed to load contact details: ${error.message}`);

  const contactRaw = (rel as any)?.contacts;
  const contact = Array.isArray(contactRaw) ? contactRaw[0] : contactRaw;

  let opened = false;
  let reason: string | undefined;

  if (channel === 'email') {
    if (!contact?.email) {
      reason = 'No email address stored for this contact.';
    } else {
      const subject = encodeURIComponent('Following up');
      const body = encodeURIComponent(messageText);
      window.open(`mailto:${contact.email}?subject=${subject}&body=${body}`, '_blank');
      opened = true;
    }
  } else if (channel === 'whatsapp') {
    if (!contact?.phone) {
      reason = 'No phone number stored for this contact.';
    } else {
      const digitsOnly = contact.phone.replace(/[^\d]/g, '');
      window.open(`https://wa.me/${digitsOnly}?text=${encodeURIComponent(messageText)}`, '_blank');
      opened = true;
    }
  } else if (channel === 'linkedin') {
    if (!contact?.linkedin_url) {
      reason = 'No LinkedIn URL stored for this contact.';
    } else {
      try {
        await navigator.clipboard.writeText(messageText);
      } catch {
        // Clipboard access can silently fail in some browser contexts — non-fatal,
        // the profile still opens, the user just pastes manually if this fails.
      }
      window.open(contact.linkedin_url, '_blank');
      opened = true;
    }
  } else if (channel === 'phone') {
    if (!contact?.phone) {
      reason = 'No phone number stored for this contact.';
    } else {
      window.open(`tel:${contact.phone}`, '_blank');
      opened = true;
    }
  }

  if (opened) {
    await logInteraction({
      relationshipId,
      direction: 'Sent',
      channel: CHANNEL_TO_DB[channel],
      messageDate: new Date().toISOString().slice(0, 10),
      messageText,
    });
  }

  return { opened, reason };
}
