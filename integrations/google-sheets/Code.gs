/**
 * Seis Leches: website form → Google Sheet
 *
 * Receives Netlify's "new form submission" webhook, appends a row to the
 * "Inbound" tab of the Seis Leches Lead Tracker and emails an alert.
 *
 * Setup: see README.md in this folder. The shared secret lives in Script
 * Properties (created by setup()), never in this file or the repo.
 */

const CONFIG = {
  SHEET_NAME: 'Inbound',
  FORM_NAME: 'strategy-call',
  ALERT_EMAIL: 'mjshawell@gmail.com',
};

// Column order must match the Inbound tab's header row.
const COLUMNS = [
  'Submitted', 'Name', 'Work email', 'Company', 'Needs', 'Source page', 'Referrer',
  'UTM source', 'UTM medium', 'UTM campaign', 'Status', 'Claimed by', 'Last contact', 'Notes',
];

/** Run once from the Apps Script editor. Creates the secret and logs it. */
function setup() {
  const props = PropertiesService.getScriptProperties();
  let token = props.getProperty('WEBHOOK_TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('WEBHOOK_TOKEN', token);
  }
  Logger.log('Webhook token (add to the end of your web app URL as ?token=...):\n' + token);
}

/** Netlify posts here. */
function doPost(e) {
  try {
    const expected = PropertiesService.getScriptProperties().getProperty('WEBHOOK_TOKEN');
    if (!expected || !e || !e.parameter || e.parameter.token !== expected) {
      return json_({ ok: false, error: 'unauthorized' });
    }

    const payload = JSON.parse(e.postData.contents);
    if (payload.form_name && payload.form_name !== CONFIG.FORM_NAME) {
      return json_({ ok: true, skipped: 'other form' });
    }

    // Netlify retries webhooks; don't add the same submission twice.
    const cache = CacheService.getScriptCache();
    if (payload.id && cache.get('sub_' + payload.id)) {
      return json_({ ok: true, duplicate: true });
    }

    const d = payload.data || {};
    const row = [
      payload.created_at ? new Date(payload.created_at) : new Date(),
      clean_(d.name),
      clean_(d.email),
      clean_(d.company),
      clean_(d.need),
      clean_(d.source_page),
      clean_(d.referrer),
      clean_(d.utm_source),
      clean_(d.utm_medium),
      clean_(d.utm_campaign),
      'New',
      '',
      '',
      '',
    ];

    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
      if (!sheet) throw new Error('Missing sheet: ' + CONFIG.SHEET_NAME);
      sheet.appendRow(row);
      if (payload.id) cache.put('sub_' + payload.id, '1', 21600); // 6 hours
    } finally {
      lock.releaseLock();
    }

    sendAlert_(row);
    return json_({ ok: true });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: String(err) });
  }
}

/** Plain-text alert with a link straight to the Inbound tab. */
function sendAlert_(row) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  const link = ss.getUrl() + '#gid=' + sheet.getSheetId();
  const [submitted, name, email, company, need, page, referrer, src, medium, campaign] = row;
  const source = src ? [src, medium, campaign].filter(String).join(' / ') : referrer || '(direct)';

  MailApp.sendEmail({
    to: CONFIG.ALERT_EMAIL,
    replyTo: email || undefined,
    subject: 'New website lead: ' + (name || 'Unknown') + (company ? ' (' + company + ')' : ''),
    body: [
      'New strategy call request from seisleches.com',
      '',
      'Name:     ' + name,
      'Email:    ' + email,
      'Company:  ' + (company || '-'),
      'Needs:    ' + need,
      'Source:   ' + source,
      'Landed on: ' + (page || '/'),
      'Received: ' + Utilities.formatDate(submitted, 'America/Los_Angeles', 'MMM d, yyyy h:mm a'),
      '',
      'Reply to this email to respond directly. Claim it in the tracker:',
      link,
    ].join('\n'),
  });
}

/** Trim, cap length, and stop text being read as a spreadsheet formula. */
function clean_(value) {
  let s = value == null ? '' : String(value).trim().slice(0, 500);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** Optional: run from the editor to check the sheet and email without the website. */
function testWithSampleLead() {
  const token = PropertiesService.getScriptProperties().getProperty('WEBHOOK_TOKEN');
  doPost({
    parameter: { token: token },
    postData: {
      contents: JSON.stringify({
        id: 'test-' + Date.now(),
        form_name: CONFIG.FORM_NAME,
        created_at: new Date().toISOString(),
        data: {
          name: 'Test Lead', email: CONFIG.ALERT_EMAIL, company: 'Test Co',
          need: 'The whole loop', source_page: '/', referrer: '(direct)',
          utm_source: 'test', utm_medium: 'manual', utm_campaign: 'setup-check',
        },
      }),
    },
  });
}
