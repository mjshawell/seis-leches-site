import type { APIRoute } from 'astro';
import { indexable, siteUrl } from '../lib/seo';

// Pre-launch: crawling stays allowed so search engines can read each page's
// "noindex" tag (blocking crawling would hide that tag from them).
export const GET: APIRoute = () => {
  const lines = indexable
    ? ['User-agent: *', 'Allow: /', 'Disallow: /thanks/', '', `Sitemap: ${new URL('/sitemap-index.xml', siteUrl)}`]
    : ['# Pre-launch: pages carry noindex until the site is live on its own domain.', 'User-agent: *', 'Allow: /'];
  return new Response(lines.join('\n') + '\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
