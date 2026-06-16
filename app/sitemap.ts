import type { MetadataRoute } from 'next'
import { source } from '@/lib/source'

const SITE_URL = 'https://nenjo.ai'
const STATIC_LAST_MODIFIED = new Date('2026-06-15')

export const dynamic = 'force-static'

function toLastModified(value: string | undefined): Date | undefined {
  if (!value) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

/**
 * Serves /sitemap.xml. Covers the public marketing routes plus every docs page
 * discovered from the Fumadocs source so the /docs subtree is fully crawlable.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1, lastModified: STATIC_LAST_MODIFIED },
    {
      url: `${SITE_URL}/pricing`,
      changeFrequency: 'monthly',
      priority: 0.8,
      lastModified: STATIC_LAST_MODIFIED,
    },
    {
      url: `${SITE_URL}/privacy`,
      changeFrequency: 'yearly',
      priority: 0.3,
      lastModified: STATIC_LAST_MODIFIED,
    },
    {
      url: `${SITE_URL}/terms`,
      changeFrequency: 'yearly',
      priority: 0.3,
      lastModified: STATIC_LAST_MODIFIED,
    },
    {
      url: `${SITE_URL}/cookies`,
      changeFrequency: 'yearly',
      priority: 0.3,
      lastModified: STATIC_LAST_MODIFIED,
    },
  ]

  const docsRoutes: MetadataRoute.Sitemap = source.getPages().map((page) => ({
    url: `${SITE_URL}${page.url}`,
    changeFrequency: 'weekly' as const,
    priority: page.url === '/docs/platform/security' || page.url === '/docs' ? 0.8 : 0.7,
    lastModified: toLastModified(page.data.lastModified),
  }))

  return [...staticRoutes, ...docsRoutes]
}
