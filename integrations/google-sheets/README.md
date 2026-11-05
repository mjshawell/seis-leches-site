# Website form → Google Sheet

Every "Book a strategy call" submission is saved by Netlify Forms (spam filtered). The Netlify
Function `netlify/functions/submission-created.mjs` then runs automatically and sends it to this
Apps Script, which:

- appends a row to the **Inbound** tab of the *Seis Leches Lead Tracker* with Status = `New`
- emails an alert to `ALERT_EMAIL` (reply-to is set to the lead, so you can answer straight from the email)
- ignores duplicate deliveries and anything without the secret token

Netlify keeps its own copy of every submission (Forms tab), so nothing is lost if the script fails.

## One-time setup (about 5 minutes)

1. Open the **Seis Leches Lead Tracker** → **Extensions → Apps Script**.
2. Replace the contents of `Code.gs` with [`Code.gs`](./Code.gs) from this folder. Save.
3. In the function dropdown pick **`setup`** → **Run**. Approve Google's permission prompt
   (it asks to edit this spreadsheet and send email as you). Copy the token from the execution log.
4. Optional check: run **`testWithSampleLead`**. A test row appears in Inbound and you get an email. Delete the row.
5. **Deploy → New deployment** → type **Web app** → *Execute as*: **Me** → *Who has access*: **Anyone** → **Deploy**.
   Copy the **Web app URL** (ends in `/exec`).
6. In Netlify: **seis-leches → Project configuration → Environment variables → Add a variable**
   - Key: `SHEETS_WEBHOOK_URL` (only project members can see it; the "secret" flag needs a paid plan)
   - Value: `<Web app URL>?token=<token from step 3>`
   Then trigger a new deploy so the function picks it up.
7. Submit the form on the live site once to confirm. Function logs: Netlify → **Logs → Functions →
   submission-created**.

Don't also add a Netlify "outgoing webhook" for the form: Apps Script replies with a redirect, which
webhooks count as a failure, so Netlify retries and eventually stops sending.

"Anyone" access is required for Netlify to reach the script; the token is what keeps others out.
Keep the token private. To rotate it, delete `WEBHOOK_TOKEN` under Project Settings → Script
Properties, run `setup` again and update the Netlify URL.

## Changing things later

- **Alert recipient:** edit `ALERT_EMAIL` in `Code.gs`, then **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy** (keeps the same URL).
- **New form field:** add the input to `src/components/Contact.astro`, a column to the Inbound tab,
  and the matching entry in `COLUMNS` and `row` in `Code.gs`. Keep the column order identical.
