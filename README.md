# Seis Leches — website

Agency site for Seis Leches, built with [Astro](https://astro.build) + Tailwind CSS v4 and deployed on Netlify.

## Run locally

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # static output in dist/
```

## Where things live

| What | Where |
| --- | --- |
| Homepage copy (services, team, stats, case studies, process) | `src/data/site.ts` |
| Page sections | `src/components/*.astro` |
| Colors, fonts, buttons (design tokens) | `src/styles/global.css` |
| SEO meta, schema.org markup | `src/layouts/Base.astro` |
| Netlify build + headers | `netlify.toml` |

Anything in `[BRACKETS]` is placeholder content.

## Theming

The site currently uses the black-and-white wireframe theme. Components only reference
semantic tokens (`ink`, `paper`, `muted`, `accent`…), so applying the brand kit is a change
to the `@theme` block in `src/styles/global.css`, not to every component.

## Contact form

Uses Netlify Forms (submissions show under Site → Forms in Netlify). Plan: swap to a HubSpot form.

## Search engines (pre-launch)

`src/lib/seo.ts` decides whether a build may be indexed:

| Build | Indexed? |
| --- | --- |
| Production on `seis-leches.netlify.app` (now) | No: every page has `noindex` |
| Deploy previews / branch deploys | No |
| Production on a custom domain | **Yes, automatically** |

Canonical links, `robots.txt` and the sitemap (`/sitemap-index.xml`) use Netlify's `URL`,
which switches to the custom domain when you connect it. No code change is needed at launch.
Override with the Netlify env var `SITE_INDEXING=on` or `off`.

**At launch:** connect the domain in Netlify, wait for the next deploy, then submit
`https://<domain>/sitemap-index.xml` in Google Search Console.

## Design tools: Google Stitch (MCP)

`.mcp.json` connects Claude Code to Google's official Stitch MCP server
(`https://stitch.googleapis.com/mcp`) for generating and editing UI screens.

- The API key is **never** stored in this repo. It's read from the `STITCH_API_KEY` environment variable.
- **Cloud sessions:** Claude Code → Environment ⚙️ → add `STITCH_API_KEY`, then start a new session with this repo.
- **Local:** `export STITCH_API_KEY=...` in your shell profile, then run `claude` from the repo folder.
- Claude Code asks once to approve project MCP servers; approve `stitch`.
- If a key is ever exposed, rotate it in Stitch settings and update the env var.
