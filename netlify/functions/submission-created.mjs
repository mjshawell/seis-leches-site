// Runs automatically on every verified (non-spam) Netlify Forms submission.
// Forwards it to the Google Apps Script that writes the Inbound tab of the lead tracker.
//
// Why a function instead of Netlify's outgoing webhook: Apps Script answers with a
// redirect, which webhooks treat as a failure and keep retrying. fetch() follows it.
//
// Needs the env var SHEETS_WEBHOOK_URL = <Apps Script /exec URL>?token=<token>

export default async (req) => {
  const { payload } = await req.json();
  if (payload?.form_name !== 'strategy-call') return new Response('skipped');

  const url = Netlify.env.get('SHEETS_WEBHOOK_URL');
  if (!url) {
    console.error('[sheets] SHEETS_WEBHOOK_URL is not set; lead kept in Netlify Forms only', payload.id);
    return new Response('not configured', { status: 500 });
  }

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        redirect: 'follow',
      });
      const text = await res.text();
      if (res.ok && text.includes('"ok":true')) {
        console.log('[sheets] saved', payload.id);
        return new Response('ok');
      }
      console.error(`[sheets] attempt ${attempt} failed`, res.status, text.slice(0, 300));
    } catch (err) {
      console.error(`[sheets] attempt ${attempt} error`, String(err));
    }
    await new Promise((r) => setTimeout(r, attempt * 1000));
  }
  return new Response('failed', { status: 502 });
};
