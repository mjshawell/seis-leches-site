# Social listening → "Listening" tab

Free, automated, hourly. `Listening.gs` (same Apps Script project as `Code.gs`) collects posts
where people ask for marketing help, scores them, skips duplicates and competitors, adds them
to the **Listening** tab of the Lead Tracker, and emails you anything **Hot** right away.

| Source | Covers | Cost | How it reaches the script |
| --- | --- | --- | --- |
| F5Bot | Reddit posts and comments, Hacker News, Lobsters | Free | Alert emails in your Gmail |
| Google Alerts | The open web, news, blogs, forums | Free | RSS feeds |
| Bluesky (optional) | Bluesky posts | Free | Search API with an app password |
| LinkedIn, Facebook groups, Nextdoor | No free API | — | Manual check-ins; add finds as rows with Source = `Manual` |

## Scoring (edit the phrase lists in **Listening Setup**, no code)

- Direct ask ("recommend an seo", "looking for a marketing agency"…): **+5**
- Pain signal ("not showing up on google", "ads not working"…): **+3** each, up to 2
- Place or niche ("inland empire", "private practice"…): **+2** each, up to 2
- Anything in **Skip if present** (for-hire posts, other agencies, job seekers) is dropped
- Logged at **3+** (Low), Warm at **5+**, **Hot at 7+** (emailed). Thresholds are in Listening Setup I2:I3.

## AI check (Gemini, free tier)

Posts that pass the keyword rules are sent to Google's Gemini API, 15 at a time, with one question:
*is this a business looking to hire outside marketing help, or an owner asking for help with an urgent
marketing problem?* Job ads, self-promotion, articles and videos come back "not a lead".

| AI verdict | Result |
| --- | --- |
| Lead, 85%+ confident (or keyword score 7+) | **Hot**, emailed |
| Lead, less confident | Warm |
| Not a lead, under 70% confident | Logged as Low, so a person can judge |
| Not a lead, 70%+ confident | Not logged (by `rescoreListening`: marked Not a fit) |
| AI unavailable (no key, quota, outage) | Keyword scoring only; `rescoreListening` retries later |

The verdict, confidence, best-fit service and a one-line reason go in the **AI check** column.
Turn it on or off and choose the model in **Listening Setup I6:I7** (default `gemini-flash-lite-latest`,
Google's alias for its current low-cost model; change it if Google retires the alias).
Post text is treated as untrusted data: the prompt tells the model never to follow instructions inside it.

**Setup:** create a free API key at https://aistudio.google.com/apikey, then in Apps Script open
**Project Settings ⚙️ → Script Properties → Add script property**: `GEMINI_API_KEY` = your key.
Run **`testAiCheck`** (three samples, writes nothing), then **`rescoreListening`** to check existing rows.

Free-tier limits and data terms are set by Google and can change. At hourly runs this uses roughly
one request an hour. Only public post text is sent. Check AI Studio for your current limits.

## One-time setup (about 15 minutes)

1. **F5Bot:** sign up at https://f5bot.com with the Gmail that owns the Lead Tracker, and add the
   keywords listed in Listening Setup (I17). Optional Gmail filter: `from:f5bot.com` → Skip the inbox.
2. **Google Alerts:** at https://www.google.com/alerts create one alert per search, e.g.
   `"looking for a marketing agency"`, `"recommend an seo" los angeles`, `"need a social media manager"`,
   `"marketing for therapists"`. Click **Show options → Deliver to: RSS feed → Create alert**, then click
   the RSS icon next to each alert, copy its URL and paste it into **Listening Setup, column E**.
3. **Apps Script:** in the Lead Tracker, open **Extensions → Apps Script**, click **+ → Script**, name it
   `Listening`, paste in [`Listening.gs`](./Listening.gs) and **Save**.
4. Run **`testListeningScoring`** (writes nothing, logs two sample scores), then **`installListeningTrigger`**.
   Approve the new permissions (reading F5Bot emails in Gmail, fetching RSS feeds).
5. Run **`runListening`** once by hand to pull anything already waiting.
6. *(Optional)* Bluesky: create an app password at bsky.app → Settings → Privacy and security →
   App passwords. Fill it into `saveBlueskyLogin`, run it once, then delete the details from the code.

No web app redeploy is needed: listening runs on its own schedule.

## Working the tab

- **Status:** New → Replied → Moved to Leads, or Not a fit (greyed out).
- Reply in the thread first with something genuinely useful, follow each community's self-promotion
  rules, and only DM when invited or allowed. When it turns into a real conversation, add it to the
  **Leads** tab and set Status here to **Moved to Leads**.
- Too noisy? Add phrases to **Skip if present**, then run **`rescoreListening`**: rows still "New"
  that now match are marked "Not a fit" (greyed, not deleted). Skip entries that look like a site
  (`youtube.com`, `linkedin.com/jobs`) match the link instead of the text.
- Or raise "Log items scoring at least". Too quiet? Add more F5Bot
  keywords and Google Alerts.
- Execution history: Apps Script → **Executions** (look for `runListening`).
