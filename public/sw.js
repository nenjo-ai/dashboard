const CACHE_NAME = 'nenjo-pwa-v2'
const APP_SHELL_ASSETS = [
  '/offline',
  '/manifest.webmanifest',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
  '/apple-touch-icon.png',
]

function isStaticAsset(pathname) {
  return pathname.startsWith('/_next/static/')
    || pathname === '/sw.js'
    || /\.(?:css|js|mjs|png|svg|jpg|jpeg|webp|avif|gif|ico|woff2?)$/i.test(pathname)
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL_ASSETS))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    )).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return
  }

  const url = new URL(event.request.url)

  if (url.origin !== self.location.origin) {
    return
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cachedOfflinePage = await caches.match('/offline')
        return cachedOfflinePage || Response.error()
      })
    )
    return
  }

  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/dashboard/api/')) {
    return
  }

  if (APP_SHELL_ASSETS.includes(url.pathname) || isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const networkFetch = fetch(event.request).then((networkResponse) => {
          if (!networkResponse.ok) {
            return networkResponse
          }

          const responseClone = networkResponse.clone()
          void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone))
          return networkResponse
        })

        return cachedResponse ?? networkFetch
      })
    )
  }
})
