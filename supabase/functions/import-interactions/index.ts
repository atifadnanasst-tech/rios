import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { contactName, ownerName, rawText } = await req.json();

    if (!rawText || typeof rawText !== 'string' || rawText.trim().length < 10) {
      return new Response(
        JSON.stringify({ error: 'rawText is required and must be a real conversation.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Server misconfiguration: OPENAI_API_KEY not set.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const owner = ownerName || 'Atif';
    const contact = contactName || 'the contact';
    const todayStr = new Date().toISOString().slice(0, 10); // server-side, always accurate regardless of caller's clock

    const prompt = `You are extracting structured message history from a pasted block of text for a relationship intelligence system.

For reference, today's actual date is ${todayStr}. Use this ONLY to resolve explicit relative markers in the text (e.g. "Today", "Yesterday", a bare day name like "Monday") into a real calendar date via correct date arithmetic.

The two people involved are:
- The owner: "${owner}" — any message written or sent BY them is direction "Sent"
- The contact: "${contact}" — any message FROM this person is direction "Received"

The pasted text may be in ANY of these formats, sometimes mixed together:
- An email thread (with Subject/From/Date headers)
- A LinkedIn message export
- A WhatsApp chat export
- A raw copy-pasted chat conversation
- A ChatGPT or AI assistant session that DISCUSSES a conversation with the contact — in this case the text contains BOTH the real conversation between "${owner}" and "${contact}" AND separate AI commentary, analysis, or coaching about that conversation. You must extract ONLY the genuine messages actually sent to or received from "${contact}" — completely ignore any AI-generated assessment, strategy suggestion, or coaching text that was never actually sent as a message.

Extract every individual message you can identify. For each one determine:
- direction: "Sent" or "Received"
- date: YYYY-MM-DD, resolved ONLY from an explicit date, an explicit day name you can place relative to ${todayStr}, or a relative marker like "Today"/"Yesterday" attached to that specific message. CRITICAL: ${todayStr} is NOT a default or fallback value. Many real chat exports show only a time of day (e.g. "3:27 PM") with no date information at all for a given message — in that case you MUST return null for that message, even if other messages nearby do have resolvable dates, and even though you know today's date. Only use ${todayStr} in your calculation when the text itself contains a marker word ("Today", "Yesterday", a day name) directly tied to that message. Never assume a message happened today just because no date is stated.
- channel: "LinkedIn", "Email", "WhatsApp", or "Phone" if determinable from formatting/context, otherwise null
- text: the exact message content, verbatim

Then provide:
- overallClassification: based on the MOST RECENT message from ${contact}, EXACTLY one of these six words, verbatim, no synonyms or variations: Positive, Neutral, Negative, Info_Request, Not_Interested, Bounced
- overallBuyingStage: based on the conversation as a whole, EXACTLY one of these six words, verbatim, no synonyms or variations: Awareness, Interest, Consideration, Intent, Closed_Won, Closed_Lost
- summary: one or two sentences on what was learned about this contact and their needs, suitable for a relationship memory log

Return ONLY valid JSON, no markdown fences, no explanation, in exactly this shape:
{
  "messages": [{"direction": "Sent", "date": "YYYY-MM-DD", "channel": "LinkedIn", "text": "..."}],
  "overallClassification": "Positive",
  "overallBuyingStage": "Interest",
  "summary": "..."
}

Text to analyze:
"""
${rawText}
"""`;

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0.1,
        max_tokens: 4000,
        messages: [
          { role: 'system', content: 'You extract structured data from conversation text. Always return valid JSON only, nothing else.' },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text();
      return new Response(
        JSON.stringify({ error: `OpenAI request failed: ${errText}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await openaiResponse.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || '';
    const cleaned = raw.replace(/^```json?\s*/i, '').replace(/```$/, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Model did not return valid JSON.', raw }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
