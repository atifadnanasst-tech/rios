import * as XLSX from 'xlsx';
import { supabase } from '../supabaseClient';

// ── Title case normalization ──────────────────────────────────────────────────
function toTitleCase(str: string): string {
  return str
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

// ── Natural language connection duration ─────────────────────────────────────
export function connectionDurationText(connectedOn: string | null): string {
  if (!connectedOn) return 'a while';
  const days = Math.floor((Date.now() - new Date(connectedOn).getTime()) / (1000 * 60 * 60 * 24));
  if (days < 14) return 'recently';
  if (days < 45) return 'a few weeks now';
  if (days < 75) return 'about a month now';
  if (days < 120) return 'a couple of months now';
  if (days < 240) return 'a few months now';
  if (days < 400) return 'several months now';
  if (days < 600) return 'about a year now';
  const years = Math.floor(days / 365);
  if (years < 2) return 'over a year now';
  if (years < 5) return `a few years now`;
  return `over ${years} years now`;
}

// ── Domain inference from role / company / industry ──────────────────────────
function inferDomain(position: string | null, company: string | null): string {
  const text = `${position || ''} ${company || ''}`.toLowerCase();
  if (text.match(/elv|low.?voltage|av |audio.?visual|security|cctv|access control/)) return 'ELV';
  if (text.match(/ict|network|cisco|telecom|infrastructure|fiber|data/)) return 'ICT';
  if (text.match(/cloud|software|saas|digital|tech/)) return 'technology';
  if (text.match(/construction|mep|contractor|project/)) return 'MEP & construction';
  if (text.match(/finance|bank|investment/)) return 'finance';
  if (text.match(/health|medical|pharma/)) return 'healthcare';
  return 'ICT and ELV';
}

// ── Message templates ─────────────────────────────────────────────────────────
function buildMessage1(firstName: string, duration: string, domain: string): string {
  return `Hi ${firstName},

We've been connected for ${duration}, and I realized we've never actually had a conversation.

I always enjoy getting to know people who are helping grow ${domain} businesses across the region, so I thought it was a good time to say hello.`;
}

function buildMessage2(firstName: string): string {
  return `Thanks, ${firstName}.

I've noticed that winning projects today often depends just as much on having dependable partners behind the scenes as it does on strong customer relationships.

Out of curiosity, what type of opportunities is your team seeing the most these days — enterprise, commercial, or infrastructure projects?`;
}

// ── Core outreach generation ──────────────────────────────────────────────────
export type OutreachRow = {
  name: string;
  designation: string;
  company: string;
  country: string;
  email: string;
  linkedin_url: string;
  message_1: string;
  message_2: string;
  relationship_id: string;
  contact_id: string;
};

export async function generateOutreachRows(relationshipIds: string[]): Promise<OutreachRow[]> {
  // Fetch all needed data in one query
  const { data, error } = await supabase
    .from('relationships')
    .select(`
      id, company, position,
      contacts(id, first_name, last_name, email, linkedin_url, connected_on, country)
    `)
    .in('id', relationshipIds);

  if (error) throw new Error(`Failed to fetch contacts for outreach: ${error.message}`);

  return (data || []).map((rel: any) => {
    const contact = Array.isArray(rel.contacts) ? rel.contacts[0] : rel.contacts;
    const rawFirstName = contact?.first_name || 'there';
    const firstName = toTitleCase(rawFirstName);
    const rawLast = contact?.last_name || '';
    const fullName = [toTitleCase(rawFirstName), rawLast ? toTitleCase(rawLast) : ''].filter(Boolean).join(' ');
    const duration = connectionDurationText(contact?.connected_on);
    const domain = inferDomain(rel.position, rel.company);

    return {
      name: fullName,
      designation: rel.position || '',
      company: rel.company || '',
      country: contact?.country || '',
      email: contact?.email || '',
      linkedin_url: contact?.linkedin_url || '',
      message_1: buildMessage1(firstName, duration, domain),
      message_2: buildMessage2(firstName),
      relationship_id: rel.id,
      contact_id: contact?.id || '',
    };
  });
}

// ── XLSX export ───────────────────────────────────────────────────────────────
export function exportOutreachToXlsx(rows: OutreachRow[]): void {
  const wsData = [
    ['Name', 'Designation', 'Company', 'Country', 'Email', 'LinkedIn URL', 'Message 1', 'Message 2'],
    ...rows.map(r => [r.name, r.designation, r.company, r.country, r.email, r.linkedin_url, r.message_1, r.message_2]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  ws['!cols'] = [
    { wch: 25 }, { wch: 30 }, { wch: 30 }, { wch: 15 },
    { wch: 30 }, { wch: 45 }, { wch: 60 }, { wch: 60 },
  ];

  // Wrap text in message columns
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let R = 1; R <= range.e.r; R++) {
    ['G', 'H'].forEach(col => {
      const cell = ws[`${col}${R + 1}`];
      if (cell) cell.s = { alignment: { wrapText: true, vertical: 'top' } };
    });
  }

  // Fixed 2026-07-14: LinkedIn URLs were written as plain text — Excel only
  // auto-detects a typed URL as a real hyperlink, not one written
  // programmatically, so every cell needed a manual F2+Enter before it
  // became clickable. Setting .l (the actual hyperlink object) on each
  // cell makes it clickable the moment the file opens, no manual step
  // needed. Styled blue+underlined to actually look like a hyperlink too,
  // since a bare .l with no style still renders as plain black text.
  for (let R = 1; R <= range.e.r; R++) {
    const cell = ws[`F${R + 1}`];
    if (cell && cell.v) {
      cell.l = { Target: cell.v, Tooltip: 'Open LinkedIn profile' };
      cell.s = { font: { color: { rgb: '0563C1' }, underline: true } };
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Outreach');
  const now = new Date();
  const timestamp = now.toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
  XLSX.writeFile(wb, `RIOS_Outreach_${timestamp}.xlsx`);
}

// ── Mark contacts as outreached (cadence step 1) ─────────────────────────────
export async function markAsOutreached(rows: OutreachRow[]): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const nextTouchDue = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const relationshipIds = rows.map(r => r.relationship_id);

  const { error: relError } = await supabase
    .from('relationships')
    .update({
      touch_number: 1,
      cadence_step: 1,
      next_touch_due: nextTouchDue,
      last_outreach_date: today,
    })
    .in('id', relationshipIds)
    .eq('touch_number', 0);

  if (relError) throw new Error(`Failed to mark as outreached: ${relError.message}`);

  // Log Message 1 as message_text so it appears in history
  const events = rows.map(r => ({
    relationship_id: r.relationship_id,
    event_type: 'message_sent',
    direction: 'Sent',
    channel: 'LinkedIn',
    message_text: r.message_1,
    source: 'outreach_export',
    message_date: today,
  }));

  const { error: evError } = await supabase.from('relationship_events').insert(events);
  if (evError) console.error('Failed to log outreach events:', evError.message);
}

// ── Log Activity (bulk complete with optional shared note) ───────────────────
export async function logBulkActivity(
  relationshipIds: string[],
  note: string | null,
  analysisModel: string
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  // Always: increment touch_number, advance cadence, set next touch
  // Cadence: 7 → 15 → 21 → 30 → 45 days
  const CADENCE_DAYS = [7, 15, 21, 30, 45];

  // Fetch current cadence steps
  const { data: rels } = await supabase
    .from('relationships')
    .select('id, cadence_step, touch_number')
    .in('id', relationshipIds);

  for (const rel of rels || []) {
    const nextStep = (rel.cadence_step || 0) + 1;
    const days = CADENCE_DAYS[Math.min(nextStep - 1, CADENCE_DAYS.length - 1)];
    const nextDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    await supabase.from('relationships').update({
      touch_number: (rel.touch_number || 0) + 1,
      cadence_step: nextStep,
      next_touch_due: nextDate,
      last_outreach_date: today,
    }).eq('id', rel.id);
  }

  // Log events
  const events = relationshipIds.map(id => ({
    relationship_id: id,
    event_type: note ? 'note_added' : 'message_sent',
    direction: 'Sent',
    channel: 'LinkedIn',
    message_text: note || null,
    source: 'log_activity',
    message_date: today,
  }));
  await supabase.from('relationship_events').insert(events);

  // If note provided: one shared recompute call using the note as context
  // TODO v2: individual history per contact for more personalized next actions
  if (note && relationshipIds.length > 0) {
    try {
      const { data: org } = await supabase
        .from('organisations')
        .select('ai_analysis_model')
        .limit(1)
        .single();
      const model = org?.ai_analysis_model || analysisModel || 'gpt-4o-mini';

      // Use the first relationship as the representative for the shared recompute
      // The note is the signal; all contacts get the same next-action result
      await supabase.functions.invoke('relationship-intelligence-recompute', {
        body: { relationshipId: relationshipIds[0], trigger: 'log_activity', model },
      });
    } catch (err) {
      console.error('Shared recompute failed:', err);
    }
  }
}

// ── Snooze contacts ───────────────────────────────────────────────────────────
export async function snoozeContacts(relationshipIds: string[], until: string, reason?: string): Promise<void> {
  const { error } = await supabase
    .from('relationships')
    .update({
      excluded_until: until,
      exclusion_reason: reason || 'Snoozed',
      next_touch_due: null, // clear so they don't show in queue until resurface
    })
    .in('id', relationshipIds);
  if (error) throw new Error(`Failed to snooze contacts: ${error.message}`);
}
