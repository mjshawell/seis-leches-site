// Decides whether search engines may index this build.
//
// Netlify sets URL to the project's main address (your custom domain once one is
// connected) and CONTEXT to "production" | "deploy-preview" | "branch-deploy".
//
// Indexing is ON only for production builds on a real domain, so:
//   - seis-leches.netlify.app (pre-launch)  -> hidden from search
//   - deploy previews / branch deploys     -> hidden from search
//   - seisleches.com (or any custom domain) -> indexable, automatically
//
// Manual override: set SITE_INDEXING=on or SITE_INDEXING=off in Netlify env vars.

export const siteUrl = process.env.URL || 'http://localhost:4321';

const host = new URL(siteUrl).hostname;
const override = process.env.SITE_INDEXING?.toLowerCase();
const isTemporaryHost = host === 'localhost' || host.endsWith('.netlify.app');

export const indexable =
  override === 'on' ? true :
  override === 'off' ? false :
  process.env.CONTEXT === 'production' && !isTemporaryHost;
