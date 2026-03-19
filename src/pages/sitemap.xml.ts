import type { APIRoute } from 'astro';
import { createSupabaseServiceClient } from '../lib/supabase';

export const GET: APIRoute = async ({ url }) => {
  const base = url.origin;
  const supabase = createSupabaseServiceClient();

  const { data: countries } = await supabase
    .from('countries')
    .select('slug, created_at')
    .order('sort_order');

  interface SitemapPage {
    loc: string;
    priority: string;
    changefreq: string;
    lastmod?: string;
  }

  const staticPages: SitemapPage[] = [
    { loc: base, priority: '1.0', changefreq: 'daily' },
  ];

  const countryPages: SitemapPage[] = (countries ?? []).map((c) => ({
    loc: `${base}/${c.slug}`,
    priority: '0.8',
    changefreq: 'weekly',
    lastmod: c.created_at ? c.created_at.slice(0, 10) : undefined,
  }));

  const allPages = [...staticPages, ...countryPages];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages
  .map(
    (p) => `  <url>
    <loc>${p.loc}</loc>
    ${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>\n    ` : ''}<changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`
  )
  .join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
