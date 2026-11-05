// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// Netlify provides URL (the custom domain once connected), so canonical links,
// the sitemap and schema markup follow the domain without code changes.
const site = process.env.URL || 'http://localhost:4321';

export default defineConfig({
  site,
  trailingSlash: 'ignore',
  integrations: [
    sitemap({ filter: (page) => !page.includes('/thanks') }),
  ],
  vite: { plugins: [tailwindcss()] },
});
