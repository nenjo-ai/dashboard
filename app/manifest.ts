import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Nenjo',
    short_name: 'Nenjo',
    description: 'Nenjo is an agent-first platform for teams building real agent products.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#f5f7fb',
    categories: ['productivity', 'business', 'developer'],
    icons: [
      {
        src: '/pwa-icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/pwa-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/pwa-icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
