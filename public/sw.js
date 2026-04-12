const CACHE_NAME = 'nenjo-pwa-v2'
const STREAM_DB = 'nenjo-chat-streams'
const STREAM_STORE = 'snapshots'
const APP_SHELL_ASSETS = [
  '/offline',
  '/manifest.webmanifest',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
  '/apple-touch-icon.png',
]

function openStreamDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(STREAM_DB, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STREAM_STORE)) {
        db.createObjectStore(STREAM_STORE, { keyPath: 'sessionId' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function writeSnapshot(snapshot) {
  const db = await openStreamDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STREAM_STORE, 'readwrite')
    const store = tx.objectStore(STREAM_STORE)
    const request = snapshot.clear
      ? store.delete(snapshot.sessionId)
      : store.put(snapshot)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

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

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  const title = data.title || 'Nenjo'
  const options = {
    body: data.body || '',
    icon: data.icon || '/pwa-icon-192.png',
    badge: data.badge || '/pwa-icon-192.png',
    tag: data.tag,
    data: {
      url: data.url || '/dashboard/chat?channel=notifications',
    },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/dashboard/chat?channel=notifications'

  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of clientsList) {
      if ('focus' in client) {
        await client.navigate(targetUrl).catch(() => undefined)
        await client.focus()
        return
      }
    }

    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl)
    }
  })())
})

self.addEventListener('message', (event) => {
  const data = event.data
  if (!data || data.type !== 'chat-stream-snapshot' || !data.snapshot) {
    return
  }

  event.waitUntil((async () => {
    await writeSnapshot(data.snapshot).catch(() => undefined)

    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of clientsList) {
      client.postMessage({
        type: 'chat-stream-snapshot',
        snapshot: data.snapshot,
      })
    }
  })())
})
