/**
 * Seis Leches: website form → Google Sheet
 *
 * Called by the Netlify Function on every verified form submission. It:
 *   1. assigns the lead to a teammate (by service, rotating ties)
 *   2. appends a row to the "Inbound" tab with Status = New and Claimed by = owner
 *   3. emails the owner an alert (CC'd to the "Always CC" address)
 *   4. sends the lead an instant, branded confirmation with the booking link
 * Plus a Monday-morning pipeline digest to the active team.
 *
 * Everything people change day to day (booking link, team, toggles) lives in
 * the "Team & Settings" tab, not in this file. Setup: README.md in this folder.
 */

const CONFIG = {
  SHEET_NAME: 'Inbound',
  SETTINGS_SHEET: 'Team & Settings',
  METRICS_SHEET: 'Inbound Metrics',
  FORM_NAME: 'strategy-call',
  FALLBACK_EMAIL: 'mjshawell@gmail.com', // used if the Team tab has nobody active
  TIMEZONE: 'America/Los_Angeles',
  BRAND: { ink: '#1F1B17', accent: '#A0441F', paper: '#F4EDE1', muted: '#5E5246' },
};

// Column order must match the Inbound tab's header row.
const COLUMNS = [
  'Submitted', 'Name', 'Work email', 'Company', 'Needs', 'Source page', 'Referrer',
  'UTM source', 'UTM medium', 'UTM campaign', 'Status', 'Claimed by', 'Last contact', 'Notes',
];
const COL = Object.fromEntries(COLUMNS.map((c, i) => [c, i]));

/* ------------------------------------------------------------------ setup */

/** Run once from the editor. Creates the shared secret and logs it. */
function setup() {
  const props = PropertiesService.getScriptProperties();
  let token = props.getProperty('WEBHOOK_TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    props.setProperty('WEBHOOK_TOKEN', token);
  }
  Logger.log('Webhook token (add to the end of your web app URL as ?token=...):\n' + token);
}

/** Run once from the editor to schedule the Monday 8 AM digest. Safe to re-run. */
function installTriggers() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'weeklyDigest')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('weeklyDigest')
    .timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).inTimezone(CONFIG.TIMEZONE)
    .create();
  Logger.log('Monday 8 AM digest scheduled.');
}

/* --------------------------------------------------------------- webhook */

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

    // Retries must not add the same submission twice.
    const cache = CacheService.getScriptCache();
    if (payload.id && cache.get('sub_' + payload.id)) {
      return json_({ ok: true, duplicate: true });
    }

    const d = payload.data || {};
    const settings = getSettings_();
    const lead = {
      submitted: payload.created_at ? new Date(payload.created_at) : new Date(),
      name: clean_(d.name),
      email: clean_(d.email),
      company: clean_(d.company),
      need: clean_(d.need),
      page: clean_(d.source_page),
      referrer: clean_(d.entry_referrer), // not d.referrer: Netlify fills that with its own value
      utmSource: clean_(d.utm_source),
      utmMedium: clean_(d.utm_medium),
      utmCampaign: clean_(d.utm_campaign),
    };

    let owner;
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      owner = assignOwner_(lead.need, getTeam_());
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
      if (!sheet) throw new Error('Missing sheet: ' + CONFIG.SHEET_NAME);
      sheet.appendRow([
        lead.submitted, lead.name, lead.email, lead.company, lead.need, lead.page, lead.referrer,
        lead.utmSource, lead.utmMedium, lead.utmCampaign,
        'New', owner ? owner.name : '', '', '',
      ]);
      if (payload.id) cache.put('sub_' + payload.id, '1', 21600); // 6 hours
    } finally {
      lock.releaseLock();
    }

    // Emails run after the row is saved, so a mail problem never loses a lead.
    try { sendAlert_(lead, owner, settings); } catch (err) { console.error('alert failed', err); }
    if (settings.autoReply) {
      try { sendAutoReply_(lead, owner, settings); } catch (err) { console.error('auto-reply failed', err); }
    }
    return json_({ ok: true, owner: owner ? owner.name : null });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: String(err) });
  }
}

/* ------------------------------------------------------- settings & team */

function getSettings_() {
  const defaults = { bookingUrl: '', ccEmail: CONFIG.FALLBACK_EMAIL, autoReply: true, digest: true, signoff: 'The Seis Leches team' };
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SETTINGS_SHEET);
  if (!sheet) return defaults;
  const [booking, cc, autoReply, digest, signoff] = sheet.getRange('B2:B6').getValues().map((r) => r[0]);
  return {
    bookingUrl: /^https:\/\//.test(String(booking).trim()) ? String(booking).trim() : '',
    ccEmail: isEmail_(cc) ? String(cc).trim() : '',
    autoReply: autoReply !== false,
    digest: digest !== false,
    signoff: String(signoff || defaults.signoff).trim(),
  };
}

/** Active teammates with a valid email, in the order listed. */
function getTeam_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SETTINGS_SHEET);
  if (!sheet) return [];
  return sheet.getRange('A10:D29').getValues()
    .map(([name, email, service, active]) => ({
      name: String(name).trim(),
      email: String(email).trim(),
      service: String(service || 'Any').trim(),
      active: active === true,
    }))
    .filter((m) => m.active && m.name && isEmail_(m.email));
}

/**
 * Specialists for the chosen service first; "Any" teammates if no specialist;
 * everyone active if neither. "The whole loop" rotates across everyone.
 * Ties rotate (round-robin pointer per service), so work spreads evenly.
 */
function assignOwner_(need, team) {
  if (!team.length) return null;
  let pool;
  if (!need || need === 'The whole loop') {
    pool = team;
  } else {
    const specialists = team.filter((m) => m.service === need);
    const generalists = team.filter((m) => m.service === 'Any');
    pool = specialists.length ? specialists : generalists.length ? generalists : team;
  }
  const props = PropertiesService.getScriptProperties();
  const key = 'rr_' + (need || 'any').replace(/\W+/g, '_');
  const next = Number(props.getProperty(key) || 0);
  props.setProperty(key, String(next + 1));
  return pool[next % pool.length];
}

/* ----------------------------------------------------------------- emails */

function sendAlert_(lead, owner, settings) {
  const to = owner ? owner.email : CONFIG.FALLBACK_EMAIL;
  const cc = settings.ccEmail && settings.ccEmail.toLowerCase() !== to.toLowerCase() ? settings.ccEmail : '';
  const source = sourceLabel_(lead);

  MailApp.sendEmail({
    to: to,
    cc: cc || undefined,
    replyTo: isEmail_(lead.email) ? lead.email : undefined,
    subject: 'New website lead: ' + (lead.name || 'Unknown') + (lead.company ? ' (' + lead.company + ')' : '') +
      (owner ? ' → ' + owner.name : ''),
    body: [
      owner ? owner.name.split(' ')[0] + ', this one is yours.' : 'New lead (no active teammate to assign it to).',
      '',
      'Name:      ' + lead.name,
      'Email:     ' + lead.email,
      'Company:   ' + (lead.company || '-'),
      'Needs:     ' + lead.need,
      'Source:    ' + source,
      'Landed on: ' + (lead.page || '/'),
      'Received:  ' + fmtDate_(lead.submitted, 'MMM d, yyyy h:mm a'),
      '',
      settings.autoReply
        ? 'They already got an automatic confirmation' + (settings.bookingUrl ? ' with the booking link.' : '.')
        : 'Auto-reply is off. Reach out yourself.',
      'Reply to this email to answer them directly, then update Status in the tracker:',
      sheetLink_(CONFIG.SHEET_NAME),
    ].join('\n'),
  });
}

function sendAutoReply_(lead, owner, settings) {
  if (!isEmail_(lead.email)) return;
  const first = (lead.name || '').split(' ')[0] || 'there';
  const who = owner ? owner.name.split(' ')[0] + ' from our team' : 'Someone from our team';
  const topic = lead.need && lead.need !== 'The whole loop' ? lead.need.toLowerCase() : 'your marketing';
  const b = CONFIG.BRAND;

  const bookingText = settings.bookingUrl
    ? 'Want to skip the back-and-forth? Pick a time for your free 30-minute strategy call:'
    : "We'll email you within one business day to set up your free 30-minute strategy call.";

  const text = [
    'Hi ' + first + ',',
    '',
    'Thanks for reaching out about ' + topic + '. ' + who + ' is reviewing your details and will follow up within one business day.',
    '',
    bookingText,
    settings.bookingUrl || '',
    '',
    "On the call you'll get three quick wins you can act on, whether or not we work together.",
    '',
    settings.signoff,
    'Seis Leches · Full-funnel marketing · Pomona, CA',
  ].join('\n');

  const button = settings.bookingUrl
    ? '<p style="margin:28px 0"><a href="' + esc_(settings.bookingUrl) + '" style="background:' + b.accent +
      ';color:#ffffff;text-decoration:none;font-weight:700;padding:14px 26px;border-radius:999px;display:inline-block">Book your strategy call</a></p>'
    : '';

  const html =
    '<div style="background:' + b.paper + ';padding:32px 16px;font-family:Helvetica,Arial,sans-serif">' +
    '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden">' +
    '<div style="background:' + b.ink + ';color:#ffffff;padding:22px 32px;font-size:20px;font-weight:800;letter-spacing:-0.01em">Seis Leches</div>' +
    '<div style="padding:32px;color:' + b.ink + ';font-size:16px;line-height:1.6">' +
    '<p style="margin:0 0 16px">Hi ' + esc_(first) + ',</p>' +
    '<p style="margin:0 0 16px">Thanks for reaching out about ' + esc_(topic) + '. ' + esc_(who) +
    ' is reviewing your details and will follow up within one business day.</p>' +
    '<p style="margin:0">' + esc_(bookingText) + '</p>' + button +
    '<p style="margin:0 0 24px;color:' + b.muted + '">On the call you\'ll get three quick wins you can act on, whether or not we work together.</p>' +
    '<p style="margin:0">' + esc_(settings.signoff) + '</p>' +
    '</div>' +
    '<div style="padding:16px 32px;border-top:1px solid #eee;color:' + b.muted + ';font-size:13px">Seis Leches · Full-funnel marketing · Pomona, CA</div>' +
    '</div></div>';

  MailApp.sendEmail({
    to: lead.email,
    name: 'Seis Leches',
    replyTo: owner ? owner.email : CONFIG.FALLBACK_EMAIL,
    subject: 'Got it, ' + first + ". Let's book your strategy call",
    body: text,
    htmlBody: html,
  });
}

/* ------------------------------------------------------------ weekly digest */

/** Scheduled by installTriggers(). Also safe to run by hand to preview. */
function weeklyDigest() {
  const settings = getSettings_();
  if (!settings.digest) return;

  const team = getTeam_();
  const recipients = [...new Set(team.map((m) => m.email).concat(settings.ccEmail ? [settings.ccEmail] : []))];
  if (!recipients.length) recipients.push(CONFIG.FALLBACK_EMAIL);

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  const rows = sheet.getLastRow() > 1
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, COLUMNS.length).getValues().filter((r) => r[COL.Name] && r[COL.Status] !== 'Spam')
    : [];

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 864e5);
  const twoDaysAgo = new Date(now.getTime() - 2 * 864e5);
  const lastWeek = rows.filter((r) => r[COL.Submitted] instanceof Date && r[COL.Submitted] >= weekAgo);

  const tally = (list, fn) => Object.entries(list.reduce((acc, r) => { const k = fn(r); acc[k] = (acc[k] || 0) + 1; return acc; }, {}))
    .sort((a, b) => b[1] - a[1]).map(([k, v]) => '  ' + k + ': ' + v).join('\n') || '  (none)';

  const stale = rows.filter((r) => r[COL.Status] === 'New' && r[COL.Submitted] instanceof Date && r[COL.Submitted] < twoDaysAgo);
  const statusOrder = ['New', 'Contacted', 'Call booked', 'Proposal sent', 'Won', 'Lost'];
  const pipeline = statusOrder.map((s) => '  ' + s + ': ' + rows.filter((r) => r[COL.Status] === s).length).join('\n');

  const body = [
    'Inbound pipeline, week ending ' + fmtDate_(now, 'MMM d'),
    '',
    'New leads this week: ' + lastWeek.length + '   (all time: ' + rows.length + ')',
    '',
    'By source (this week):',
    tally(lastWeek, (r) => sourceLabel_({ utmSource: r[COL['UTM source']], referrer: r[COL.Referrer] })),
    '',
    'By service (this week):',
    tally(lastWeek, (r) => r[COL.Needs] || '(not given)'),
    '',
    'Pipeline (all time):',
    pipeline,
    '',
    stale.length
      ? 'Needs follow-up: ' + stale.length + ' lead(s) still "New" after 2+ days:\n' +
        stale.map((r) => '  - ' + r[COL.Name] + (r[COL.Company] ? ' (' + r[COL.Company] + ')' : '') + ': ' + (r[COL['Claimed by']] || 'unassigned')).join('\n')
      : 'Nothing waiting: every lead older than 2 days has been contacted.',
    '',
    'Dashboard: ' + sheetLink_(CONFIG.METRICS_SHEET),
  ].join('\n');

  MailApp.sendEmail({
    to: recipients.join(','),
    name: 'Seis Leches Pipeline',
    subject: 'Seis Leches pipeline: ' + lastWeek.length + ' new lead' + (lastWeek.length === 1 ? '' : 's') + ' this week' +
      (stale.length ? ', ' + stale.length + ' need follow-up' : ''),
    body: body,
  });
}

/* ---------------------------------------------------------------- helpers */

function sourceLabel_(lead) {
  if (lead.utmSource) return String(lead.utmSource).toLowerCase();
  const ref = String(lead.referrer || '');
  if (!ref || ref === '(direct)') return 'direct';
  const m = ref.match(/^https?:\/\/(?:www\.)?([^/:?#]+)/);
  return m ? m[1] : ref;
}

function sheetLink_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(name);
  return ss.getUrl() + (sheet ? '#gid=' + sheet.getSheetId() : '');
}

function fmtDate_(date, pattern) {
  return Utilities.formatDate(date instanceof Date ? date : new Date(date), CONFIG.TIMEZONE, pattern);
}

function isEmail_(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
}

/** Trim, cap length, and stop text being read as a spreadsheet formula. */
function clean_(value) {
  let s = value == null ? '' : String(value).trim().slice(0, 500);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function esc_(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------------------ tests */

/**
 * Run from the editor: adds a test row, assigns it, emails the owner AND sends the
 * auto-reply to FALLBACK_EMAIL so you can see what leads receive. Delete the row after.
 */
function testWithSampleLead() {
  const token = PropertiesService.getScriptProperties().getProperty('WEBHOOK_TOKEN');
  const res = doPost({
    parameter: { token: token },
    postData: {
      contents: JSON.stringify({
        id: 'test-' + Date.now(),
        form_name: CONFIG.FORM_NAME,
        created_at: new Date().toISOString(),
        data: {
          name: 'Test Lead', email: CONFIG.FALLBACK_EMAIL, company: 'Test Co',
          need: 'SEO & Analytics Automation', source_page: '/', entry_referrer: '(direct)',
          utm_source: 'test', utm_medium: 'manual', utm_campaign: 'setup-check',
        },
      }),
    },
  });
  Logger.log(res.getContent());
}
