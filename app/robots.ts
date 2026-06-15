import type { MetadataRoute } from 'next'

const SITE_URL = 'https://nenjo.ai'

export const dynamic = 'force-static'

/**
 * Serves /robots.txt. Allows general and AI crawlers, keeps the authenticated
 * dashboard and API out of the index, and advertises the sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  const disallow = ['/dashboard/', '/api/']

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow,
      },
      {
        userAgent: [
          'GPTBot',
          'OAI-SearchBot',
          'ChatGPT-User',
          'ClaudeBot',
          'PerplexityBot',
          'Google-Extended',
          'CCBot',
        ],
        allow: '/',
        disallow,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
