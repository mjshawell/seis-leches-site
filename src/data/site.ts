// Homepage content. Edit copy here; layout lives in src/components.
// Anything in [BRACKETS] is a placeholder waiting for real content.

export const site = {
  name: 'Seis Leches',
  location: 'Pomona, CA',
  email: '[hello@seisleches.com]',
  // Booking page for strategy calls (Google Calendar appointment schedule or Calendly).
  // Keep in sync with "Booking link" in the lead tracker's Team & Settings tab.
  // Empty = thank-you page shows a plain confirmation instead of the calendar.
  bookingUrl: '',
  tagline: 'Build the brand. Drive the traffic. Prove it worked.',
  description:
    'Seis Leches is a full-funnel marketing agency: branding & social, performance & paid media, and SEO & marketing analytics automation.',
  social: [
    { label: 'Instagram', href: '#' },
    { label: 'LinkedIn', href: '#' },
  ],
};

export const nav = [
  { label: 'Services', href: '#services' },
  { label: 'Work', href: '#work' },
  { label: 'About', href: '#team' },
  { label: 'Process', href: '#process' },
];

export type Service = {
  step: string;
  title: string;
  blurb: string;
  items: string[];
  cta: string;
  href: string;
  featured?: boolean;
};

export const services: Service[] = [
  {
    step: '01 · Build',
    title: 'Branding & Social',
    blurb: 'Identity, voice and content that make people stop scrolling and remember your name.',
    items: ['Brand identity & guidelines', 'Social strategy & content calendars', 'Short-form video & creative', 'Community management'],
    cta: 'Explore Branding & Social',
    href: '#',
  },
  {
    step: '02 · Drive',
    title: 'Performance & Paid Media',
    blurb: 'Campaigns built around your pipeline, not vanity metrics. Every dollar tracked to an outcome.',
    items: ['Google, Meta & LinkedIn Ads', 'Funnel & landing page strategy', 'Creative testing frameworks', 'Budget pacing & ROAS reporting'],
    cta: 'Explore Performance & Paid',
    href: '#',
  },
  {
    step: '03 · Measure',
    title: 'SEO & Analytics Automation',
    blurb: 'Search visibility plus dashboards and reporting that update themselves. Our signature service.',
    items: ['Technical & on-page SEO', 'GA4 & tag setup and audits', 'Automated Looker Studio dashboards', 'Reporting & workflow automation'],
    cta: 'Explore SEO & Analytics',
    href: '#',
    featured: true,
  },
];

// Brands carousel. Replace each label with a logo later (see Brands.astro).
export const brands = Array.from({ length: 12 }, (_, i) => `[BRAND ${String(i + 1).padStart(2, '0')}]`);

export const caseStudies = {
  feature: { tag: 'SEO · Analytics', title: '[CLIENT]: [one-line outcome headline]', stat: '[+XX%]', statLabel: '[metric]' },
  side: [
    { tag: 'Paid Media', title: '[CLIENT]: [outcome headline]', stat: '[X.Xx ROAS]' },
    { tag: 'Branding · Social', title: '[CLIENT]: [outcome headline]', stat: '[+XXk reach]' },
  ],
};

export const testimonials = [
  { quote: '[Client quote about the result and what it was like working with the team.]', name: '[Name]', role: '[Title, Company 01]' },
  { quote: '[A second client on the numbers: what moved, by how much, and how fast.]', name: '[Name]', role: '[Title, Company 02]' },
  { quote: '[A third client on the experience: communication, reporting, how it felt to work together.]', name: '[Name]', role: '[Title, Company 03]' },
];

export const team = [
  { name: '[Name]', role: 'Brand & Creative Lead' },
  { name: '[Name]', role: 'Social & Content Lead' },
  { name: '[Name]', role: 'Paid Media Lead' },
  { name: '[Name]', role: 'Performance & Growth' },
  { name: '[Name]', role: 'SEO Lead' },
  { name: '[Name]', role: 'Analytics & Automation' },
];

export const process = [
  { n: '01', title: 'Discover', body: "A strategy call and audit of your brand, channels and tracking. We find what's working and what's leaking." },
  { n: '02', title: 'Plan', body: 'A 90-day roadmap with goals, budgets and KPIs agreed up front, so success is defined before we spend.' },
  { n: '03', title: 'Launch', body: 'Creative, campaigns and SEO fixes go live in tested sprints, with weekly check-ins and no black boxes.' },
  { n: '04', title: 'Measure & automate', body: 'Your live dashboard reports results automatically, and we reinvest in what the data says works.' },
];

export const needs = ['The whole loop', 'Branding & Social', 'Performance & Paid Media', 'SEO & Analytics Automation'];
