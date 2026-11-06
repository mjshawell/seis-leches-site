/**
 * Seis Leches: social listening → "Listening" tab
 *
 * Every hour (installListeningTrigger), collects posts where people ask for marketing help:
 *   - Reddit + Hacker News, via F5Bot alert emails in this Gmail (free, f5bot.com)
 *   - The open web, news and blogs, via Google Alerts RSS feeds (free)
 *   - Bluesky search (optional, free; needs an app password in Script Properties)
 * Scores each item with the phrase lists in the "Listening Setup" tab, skips
 * duplicates and competitors, appends the rest, and emails Hot items right away.
 *
 * Lives in the same Apps Script project as Code.gs and reuses its helpers.
 * LinkedIn, Facebook groups and Nextdoor have no free API: those stay manual
 * (checklist in Listening Setup); add finds as rows with Source = Manual.
 */

const LISTEN = {
  SHEET: 'Listening',
  SETUP: 'Listening Setup',
  WARM_AT: 5,
  MAX_EMAILS_PER_RUN: 50,
};

/* ------------------------------------------------------------------ setup */

/** Run once from the editor. Checks every hour. Safe to re-run. */
function installListeningTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'runListening')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('runListening').timeBased().everyHours(1).create();
  Logger.log('Listening scheduled every hour.');
}

/**
 * Optional Bluesky: create an app password at bsky.app → Settings → Privacy and
 * security → App passwords, then run this once with your details filled in,
 * and delete them from the code afterwards.
 */
function saveBlueskyLogin() {
  const handle = 'yourname.bsky.social';
  const appPassword = 'xxxx-xxxx-xxxx-xxxx';
  PropertiesService.getScriptProperties().setProperties({ BSKY_HANDLE: handle, BSKY_APP_PASSWORD: appPassword });
  Logger.log('Saved. Now remove the handle and password from this function and save.');
}

/* -------------------------------------------------------------------- run */

function runListening() {
  const setup = getListeningSetup_();
  if (!setup.enabled) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(LISTEN.SHEET);
  if (!sheet) throw new Error('Missing sheet: ' + LISTEN.SHEET);

  const lastRow = sheet.getLastRow();
  const seen = new Set(
    lastRow > 1 ? sheet.getRange(2, 4, lastRow - 1, 1).getValues().map((r) => normUrl_(r[0])).filter(String) : []
  );

  const collected = [];
  const sources = [
    ['F5Bot', () => fromF5Bot_()],
    ['Google Alerts', () => fromGoogleAlerts_(setup.feeds)],
    ['Bluesky', () => fromBluesky_(setup.bluesky)],
  ];
  sources.forEach(([name, fn]) => {
    try { collected.push(...fn()); } catch (err) { console.error('[listening] ' + name + ' failed', err); }
  });

  const rows = [];
  const hot = [];
  collected.forEach((item) => {
    const key = normUrl_(item.link);
    if (!key || seen.has(key)) return;
    seen.add(key);
    const s = scoreItem_(item.title + ' ' + item.snippet, setup, item.link);
    if (s.excluded || s.score < setup.minScore) return;
    const tier = s.score >= setup.hotScore ? 'Hot' : s.score >= LISTEN.WARM_AT ? 'Warm' : 'Low';
    const text = (item.title + (item.snippet ? ' | ' + item.snippet : '')).slice(0, 500);
    rows.push([item.found, item.source, clean_(text), item.link, s.matched.join(', '), s.score, tier, 'New', '', '']);
    if (tier === 'Hot') hot.push({ ...item, text: text, score: s.score, matched: s.matched });
  });

  if (rows.length) {
    rows.sort((a, b) => a[0] - b[0]);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
  if (hot.length && isEmail_(setup.alertEmail)) sendListeningAlert_(hot, setup.alertEmail);
  console.log('[listening] collected ' + collected.length + ', logged ' + rows.length + ', hot ' + hot.length);
}

/* ---------------------------------------------------------------- sources */

/** Unread F5Bot emails in this Gmail account. Marks them read once logged. */
function fromF5Bot_() {
  const threads = GmailApp.search('from:f5bot.com is:unread newer_than:14d', 0, LISTEN.MAX_EMAILS_PER_RUN);
  const items = [];
  threads.forEach((thread) => {
    thread.getMessages().forEach((msg) => {
      if (msg.isUnread()) items.push(...parseF5BotHtml_(msg.getBody(), msg.getDate()));
    });
    thread.markRead();
  });
  return items;
}

/** Pure: pull Reddit / HN links (with surrounding text) out of an F5Bot email. */
function parseF5BotHtml_(html, date) {
  const items = [];
  const re = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?=<a\b|$)/gi;
  let m;
  while ((m = re.exec(html))) {
    const link = decodeEntities_(m[1]);
    if (!/^https?:\/\/(?:[a-z]+\.)?(reddit\.com\/r\/|news\.ycombinator\.com\/item|lobste\.rs\/s\/)/i.test(link)) continue;
    const title = stripTags_(m[2]);
    const snippet = stripTags_(m[3]).slice(0, 400);
    const sub = link.match(/reddit\.com\/r\/([^/]+)/i);
    const source = sub ? 'Reddit r/' + sub[1] : /ycombinator/.test(link) ? 'Hacker News' : 'Lobsters';
    items.push({ found: date, source: source, title: title, snippet: snippet, link: link });
  }
  return items;
}

function fromGoogleAlerts_(feeds) {
  const items = [];
  feeds.forEach((url) => {
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) { console.error('[listening] alerts feed ' + res.getResponseCode() + ': ' + url); return; }
    items.push(...parseAlertsAtom_(res.getContentText()));
  });
  return items;
}

/** Pure: Google Alerts Atom feed → items (unwraps google.com/url redirect links). */
function parseAlertsAtom_(xml) {
  const items = [];
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  entries.forEach((e) => {
    const get = (tag) => { const m = e.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>')); return m ? m[1] : ''; };
    const href = (e.match(/<link[^>]*href="([^"]+)"/) || [])[1] || '';
    let link = decodeEntities_(href);
    const real = link.match(/[?&]url=([^&]+)/);
    if (real) link = decodeURIComponent(real[1]);
    if (!link) return;
    const host = (link.match(/^https?:\/\/(?:www\.)?([^/]+)/) || [])[1] || 'web';
    items.push({
      found: new Date(get('published') || get('updated') || Date.now()),
      source: 'Web: ' + host,
      title: stripTags_(decodeEntities_(get('title'))),
      snippet: stripTags_(decodeEntities_(get('content'))).slice(0, 400),
      link: link,
    });
  });
  return items;
}

function fromBluesky_(queries) {
  const props = PropertiesService.getScriptProperties();
  const handle = props.getProperty('BSKY_HANDLE');
  const password = props.getProperty('BSKY_APP_PASSWORD');
  if (!queries.length || !handle || !password) return [];

  const session = JSON.parse(UrlFetchApp.fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ identifier: handle, password: password }),
  }).getContentText());

  const items = [];
  queries.forEach((q) => {
    const res = UrlFetchApp.fetch(
      'https://bsky.social/xrpc/app.bsky.feed.searchPosts?sort=latest&limit=25&q=' + encodeURIComponent(q),
      { headers: { Authorization: 'Bearer ' + session.accessJwt }, muteHttpExceptions: true }
    );
    if (res.getResponseCode() !== 200) { console.error('[listening] bluesky ' + res.getResponseCode()); return; }
    (JSON.parse(res.getContentText()).posts || []).forEach((p) => {
      const rkey = String(p.uri || '').split('/').pop();
      items.push({
        found: new Date(p.indexedAt || Date.now()),
        source: 'Bluesky',
        title: '@' + p.author.handle,
        snippet: String((p.record && p.record.text) || '').slice(0, 400),
        link: 'https://bsky.app/profile/' + p.author.handle + '/post/' + rkey,
      });
    });
  });
  return items;
}

/* -------------------------------------------------------------- scoring */

/**
 * Pure. Direct ask: +5 once. Pain: +3 each (max 2). Place/niche: +2 each (max 2).
 * Skip list: phrases match the text; entries that look like a site ("youtube.com",
 * "linkedin.com/jobs") match the link instead.
 */
function scoreItem_(text, setup, link) {
  const t = ' ' + decodeEntities_(String(text)).toLowerCase().replace(/\s+/g, ' ') + ' ';
  const url = normUrl_(link || '');
  const isSite = (p) => /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/.test(p);
  const hits = (list) => list.filter((p) => p && !isSite(p) && t.includes(p));
  const siteSkip = setup.exclude.filter((p) => isSite(p) && url && (url === p || url.startsWith(p) || url.includes('.' + p)));
  if (siteSkip.length || hits(setup.exclude).length) return { excluded: true, score: 0, matched: [] };
  const direct = hits(setup.direct);
  const pain = hits(setup.pain);
  const boost = hits(setup.boost);
  const score = (direct.length ? 5 : 0) + Math.min(pain.length, 2) * 3 + Math.min(boost.length, 2) * 2;
  return { excluded: false, score: score, matched: [...direct, ...pain, ...boost] };
}

function getListeningSetup_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LISTEN.SETUP);
  if (!sheet) throw new Error('Missing sheet: ' + LISTEN.SETUP);
  const grid = sheet.getRange('A2:F60').getValues();
  const col = (i, lower) => grid.map((r) => String(r[i]).trim()).filter((v) => v && !/^add, edit/i.test(v)).map((v) => (lower ? v.toLowerCase() : v));
  const [minScore, hotScore, alertEmail, enabled] = sheet.getRange('I2:I5').getValues().map((r) => r[0]);
  return {
    direct: col(0, true), pain: col(1, true), boost: col(2, true), exclude: col(3, true),
    feeds: col(4, false).filter((u) => /^https:\/\//.test(u)),
    bluesky: col(5, false),
    minScore: Number(minScore) || 3,
    hotScore: Number(hotScore) || 7,
    alertEmail: String(alertEmail || '').trim(),
    enabled: enabled !== false,
  };
}

/**
 * Run from the editor after changing the phrase lists: re-scores every row still
 * marked "New" with the current rules. Rows that now hit the skip list become
 * "Not a fit" (greyed out, not deleted), and the rest get updated scores and tiers.
 */
function rescoreListening() {
  const setup = getListeningSetup_();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(LISTEN.SHEET);
  const n = sheet.getLastRow() - 1;
  if (n < 1) return;
  const range = sheet.getRange(2, 1, n, 10);
  const rows = range.getValues();
  let skipped = 0;
  let updated = 0;
  rows.forEach((r) => {
    if (r[7] !== 'New') return;
    r[2] = decodeEntities_(r[2]);
    const s = scoreItem_(r[2], setup, r[3]);
    if (s.excluded || s.score < setup.minScore) {
      r[7] = 'Not a fit';
      skipped++;
      return;
    }
    r[4] = s.matched.join(', ');
    r[5] = s.score;
    r[6] = s.score >= setup.hotScore ? 'Hot' : s.score >= LISTEN.WARM_AT ? 'Warm' : 'Low';
    updated++;
  });
  range.setValues(rows);
  Logger.log('Re-scored ' + updated + ', marked ' + skipped + ' as Not a fit.');
}

/* ----------------------------------------------------------------- email */

function sendListeningAlert_(items, to) {
  const body = [
    items.length + ' high-intent post' + (items.length === 1 ? '' : 's') + ' found:',
    '',
    ...items.map((i) => '• [' + i.source + '] score ' + i.score + ' (' + i.matched.join(', ') + ')\n  ' + i.text.slice(0, 220) + '\n  ' + i.link + '\n'),
    'Reply helpfully in the thread first (check the group or subreddit rules), then mark Status in the tracker:',
    sheetLink_(LISTEN.SHEET),
  ].join('\n');
  MailApp.sendEmail({
    to: to,
    name: 'Seis Leches Listening',
    subject: 'Listening: ' + items.length + ' hot post' + (items.length === 1 ? '' : 's') + ' to answer',
    body: body,
  });
}

/* --------------------------------------------------------------- helpers */

function normUrl_(url) {
  const s = String(url || '').trim();
  const m = s.match(/^https?:\/\/(?:www\.|old\.|m\.)?([^/?#]+)([^?#]*)(\?[^#]*)?/i);
  if (!m) return '';
  // Most sites identify a page by its path; Hacker News uses ?id=, so keep the query there.
  const query = /ycombinator\.com$/i.test(m[1]) ? m[3] || '' : '';
  return (m[1] + m[2].replace(/\/+$/, '') + query).toLowerCase();
}

function stripTags_(html) {
  return decodeEntities_(String(html).replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

const ENTITIES_ = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', hellip: '…', mdash: '—',
  ndash: '–', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', bull: '•', copy: '©', trade: '™', reg: '®',
};

/** Decodes HTML entities, twice, because Google Alerts double-encodes its snippets. */
function decodeEntities_(s) {
  const once = (x) => String(x).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCharCode(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    const v = ENTITIES_[e.toLowerCase()];
    return v === undefined ? m : v;
  });
  return once(once(s));
}

/* ------------------------------------------------------------------ tests */

/** Run from the editor: scores two sample posts and logs the result. Writes nothing. */
function testListeningScoring() {
  const setup = getListeningSetup_();
  [
    'Can anyone recommend an SEO person in the Inland Empire? My therapy private practice is not showing up on Google.',
    "[For Hire] I'm a freelancer offering SEO services, DM me!",
  ].forEach((t) => Logger.log(JSON.stringify(scoreItem_(t, setup)) + '  <=  ' + t));
}
