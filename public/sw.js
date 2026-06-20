const CACHE_NAME = 'nenjo-pwa-v2'
const STREAM_DB = 'nenjo-chat-streams'
const STREAM_STORE = 'snapshots'
const CRYPTO_DB = 'nenjo-crypto'
const CRYPTO_STORE = 'secrets'
const WRAP_KEY_ENTRY = 'device-wrap-key'
const VAULT_SESSION_WRAP_KEY_ENTRY = 'vault-session-wrap-key'
const VAULT_SESSION_ENTRY = 'vault-session'
const PENDING_NOTIFICATION_PREFIX = 'pending-encrypted-notification:'
const PENDING_NOTIFICATION_MAX_AGE_MS = 24 * 60 * 60 * 1000
const PAYLOAD_ALGORITHM = 'aes-256-gcm'
const AES_ALGORITHM = 'AES-GCM'
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

function base64ToBytes(value) {
  const binary = atob(value)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i)
  }
  return out
}

function bytesToBase64(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0)
  }
  return btoa(binary)
}

function openCryptoDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CRYPTO_DB, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(CRYPTO_STORE)) {
        db.createObjectStore(CRYPTO_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function readCryptoEntry(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CRYPTO_STORE, 'readonly')
    const store = tx.objectStore(CRYPTO_STORE)
    const request = store.get(key)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function writeCryptoEntry(db, key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CRYPTO_STORE, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.objectStore(CRYPTO_STORE).put(value, key)
  })
}

function deleteCryptoEntry(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CRYPTO_STORE, 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.objectStore(CRYPTO_STORE).delete(key)
  })
}

function readCryptoKeys(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CRYPTO_STORE, 'readonly')
    const store = tx.objectStore(CRYPTO_STORE)
    const request = store.getAllKeys()
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function loadVaultKeyForDecrypt(db, accountId) {
  const session = await readCryptoEntry(db, VAULT_SESSION_ENTRY)
  if (!session?.nonce || !session?.ciphertext || !session?.expires_at) return null
  if (accountId && session.account_id && session.account_id !== accountId) return null

  const expiresAt = Date.parse(session.expires_at)
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    await deleteCryptoEntry(db, VAULT_SESSION_ENTRY).catch(() => undefined)
    return null
  }

  const wrapKey = await readCryptoEntry(db, VAULT_SESSION_WRAP_KEY_ENTRY)
  if (!wrapKey) return null

  const plaintext = await crypto.subtle.decrypt(
    { name: AES_ALGORITHM, iv: base64ToBytes(session.nonce) },
    wrapKey,
    base64ToBytes(session.ciphertext)
  )

  return crypto.subtle.importKey(
    'raw',
    new Uint8Array(plaintext),
    { name: AES_ALGORITHM, length: 256 },
    false,
    ['decrypt']
  )
}

async function storageWrapKeyForDecrypt(db, stored) {
  if (stored?.version === 2 && stored?.wrap === 'vault') {
    return loadVaultKeyForDecrypt(db, stored.account_id)
  }
  return readCryptoEntry(db, WRAP_KEY_ENTRY)
}

async function loadStoredOrgContentKey(orgId, keyVersion) {
  const db = await openCryptoDb()
  const stored = await readCryptoEntry(db, `encrypted-ock:${orgId}:${keyVersion}`)
  const wrapKey = await storageWrapKeyForDecrypt(db, stored)
  if (!wrapKey || !stored?.nonce || !stored?.ciphertext) return null

  const plaintext = await crypto.subtle.decrypt(
    { name: AES_ALGORITHM, iv: base64ToBytes(stored.nonce) },
    wrapKey,
    base64ToBytes(stored.ciphertext)
  )
  return bytesToBase64(new Uint8Array(plaintext))
}

function payloadAad(accountId, objectId, objectType) {
  return new TextEncoder().encode(`${accountId}:${objectId}:${objectType}`)
}

async function decryptOrgPayload(payload) {
  if (!payload || payload.algorithm !== PAYLOAD_ALGORITHM || payload.encryption_scope !== 'org') {
    return null
  }
  const base64Key = await loadStoredOrgContentKey(payload.account_id, payload.key_version)
  if (!base64Key) return null

  const key = await crypto.subtle.importKey(
    'raw',
    base64ToBytes(base64Key),
    { name: AES_ALGORITHM, length: 256 },
    false,
    ['decrypt']
  )
  const plaintext = await crypto.subtle.decrypt(
    {
      name: AES_ALGORITHM,
      iv: base64ToBytes(payload.nonce),
      additionalData: payloadAad(payload.account_id, payload.object_id, payload.object_type),
    },
    key,
    base64ToBytes(payload.ciphertext)
  )
  return new TextDecoder().decode(plaintext)
}

function encryptedNotificationId(data) {
  const payload = data.encrypted_payload
  if (typeof data.tag === 'string' && data.tag.trim()) return data.tag
  if (payload?.account_id && payload?.object_id && payload?.object_type) {
    return `${payload.account_id}:${payload.object_type}:${payload.object_id}`
  }
  return `notification:${Date.now()}`
}

async function storePendingEncryptedNotification(id, data) {
  if (!data.encrypted_payload) return
  const db = await openCryptoDb()
  const now = Date.now()
  await writeCryptoEntry(db, `${PENDING_NOTIFICATION_PREFIX}${id}`, {
    id,
    data: {
      ...data,
      tag: typeof data.tag === 'string' && data.tag.trim() ? data.tag : id,
    },
    created_at: now,
    expires_at: now + PENDING_NOTIFICATION_MAX_AGE_MS,
  })
}

async function resolveEncryptedNotification(data, controlOptions = {}) {
  const pendingId = encryptedNotificationId(data)
  const notificationOptions = {
    body: data.body || 'New encrypted notification',
    icon: data.icon || '/pwa-icon-192.png',
    badge: data.badge || '/pwa-icon-192.png',
    tag: data.tag || pendingId,
    data: {
      url: data.url || '/dashboard/chat?channel=notifications',
      pendingNotificationId: pendingId,
    },
  }
  let decrypted = false

  try {
    const plaintext = await decryptOrgPayload(data.encrypted_payload)
    if (plaintext) {
      const parsed = JSON.parse(plaintext)
      if (typeof parsed.body === 'string' && parsed.body.trim()) {
        notificationOptions.body = parsed.body
      }
      if (
        controlOptions.preserveTag !== true &&
        typeof parsed.tag === 'string' &&
        parsed.tag.trim()
      ) {
        notificationOptions.tag = parsed.tag
      }
      delete notificationOptions.data.pendingNotificationId
      decrypted = true
    }
  } catch {
    // Keep the generic fallback if local decryption is unavailable or fails.
  }

  if (!decrypted && controlOptions.storePending !== false) {
    await storePendingEncryptedNotification(pendingId, data).catch(() => undefined)
  }

  return {
    title: data.title || 'Nenjo',
    options: notificationOptions,
    decrypted,
  }
}

async function retryPendingEncryptedNotifications() {
  const db = await openCryptoDb()
  const keys = await readCryptoKeys(db)
  await Promise.all(
    keys
      .filter((key) => typeof key === 'string' && key.startsWith(PENDING_NOTIFICATION_PREFIX))
      .map(async (key) => {
        const pending = await readCryptoEntry(db, key)
        if (!pending?.data || typeof pending.expires_at !== 'number' || pending.expires_at <= Date.now()) {
          await deleteCryptoEntry(db, key).catch(() => undefined)
          return
        }

        const notification = await resolveEncryptedNotification(pending.data, {
          preserveTag: true,
          storePending: false,
        })
        if (!notification.decrypted) return

        await self.registration.showNotification(notification.title, notification.options)
        await deleteCryptoEntry(db, key).catch(() => undefined)
      })
  )
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
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse.ok) {
            const responseClone = networkResponse.clone()
            void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone))
          }
          return networkResponse
        })
        .catch(async () => {
          const cachedResponse = await caches.match(event.request)
          return cachedResponse || Response.error()
        })
    )
  }
})

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {}
  event.waitUntil((async () => {
    const notification = data.kind === 'encrypted_notification'
      ? await resolveEncryptedNotification(data)
      : {
          title: data.title || 'Nenjo',
          options: {
            body: data.body || '',
            icon: data.icon || '/pwa-icon-192.png',
            badge: data.badge || '/pwa-icon-192.png',
            tag: data.tag,
            data: {
              url: data.url || '/dashboard/chat?channel=notifications',
            },
          },
        }

    await self.registration.showNotification(notification.title, notification.options)
  })())
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
  if (data?.type === 'retry-encrypted-notifications') {
    event.waitUntil(retryPendingEncryptedNotifications().catch(() => undefined))
    return
  }

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
