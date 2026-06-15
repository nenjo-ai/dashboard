import type { MetadataRoute } from 'next'
import { source } from '@/lib/source'

const SITE_URL = 'https://nenjo.ai'

export const dynamic = 'force-static'

/**
 * Serves /sitemap.xml. Covers the public marketing routes plus every docs page
 * discovered from the Fumadocs source so the /docs subtree is fully crawlable.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/pricing`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/terms`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/cookies`, changeFrequency: 'yearly', priority: 0.3 },
  ]

  const docsRoutes: MetadataRoute.Sitemap = source.getPages().map((page) => ({
    url: `${SITE_URL}${page.url}`,
    changeFrequency: 'weekly',
    priority: 0.7,
  }))

  return [...staticRoutes, ...docsRoutes]
}
