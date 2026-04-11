"use client"

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  deletePushSubscription,
  fetchPushConfig,
  upsertPushSubscription,
} from '@/lib/api'

declare global {
  interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[]
    readonly userChoice: Promise<{
      outcome: 'accepted' | 'dismissed'
      platform: string
    }>
    prompt: () => Promise<void>
  }
}

interface PwaContextValue {
  canInstall: boolean
  isBannerVisible: boolean
  isIos: boolean
  isMobile: boolean
  isOnline: boolean
  isStandalone: boolean
  notificationsEnabled: boolean
  notificationsSupported: boolean
  dismissInstallNudge: () => void
  disableNotifications: () => Promise<void>
  enableNotifications: () => Promise<void>
  promptInstall: () => Promise<void>
  showInstallNudge: () => void
}

const DISMISS_KEY = 'nenjo-pwa-install-dismissed'
const PwaContext = createContext<PwaContextValue | null>(null)

function isStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true
}

function getInitialBrowserState() {
  if (typeof window === 'undefined') {
    return {
      isBannerVisible: false,
      isDismissed: true,
      isIos: false,
      isMobile: false,
      isOnline: true,
      isStandalone: true,
    }
  }

  const ua = window.navigator.userAgent
  const isMobile = /Android|iPhone|iPad|iPod/i.test(ua)
  const isIos = /iPad|iPhone|iPod/i.test(ua)
  const isStandalone = isStandaloneMode()
  const isDismissed = window.localStorage.getItem(DISMISS_KEY) === 'true'

  return {
    isBannerVisible: isMobile && !isStandalone && !isDismissed && isIos,
    isDismissed,
    isIos,
    isMobile,
    isOnline: window.navigator.onLine,
    isStandalone,
  }
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const initialState = getInitialBrowserState()
  const [isStandalone, setIsStandalone] = useState(initialState.isStandalone)
  const [isMobile] = useState(initialState.isMobile)
  const [isIos] = useState(initialState.isIos)
  const [isOnline, setIsOnline] = useState(initialState.isOnline)
  const [isDismissed, setIsDismissed] = useState(initialState.isDismissed)
  const [isBannerVisible, setIsBannerVisible] = useState(initialState.isBannerVisible)
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [notificationsSupported, setNotificationsSupported] = useState(false)

  const syncPushSubscription = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setNotificationsSupported(false)
      setNotificationsEnabled(false)
      return
    }

    setNotificationsSupported(true)
    const registration = await navigator.serviceWorker.ready
    const existing = await registration.pushManager.getSubscription()
    setNotificationsEnabled(Boolean(existing))
  }

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return
    }

    void navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    }).catch(() => {
      // PWA features should degrade without affecting the app.
    })

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as BeforeInstallPromptEvent)

      if (!isDismissed && !isStandaloneMode()) {
        setIsBannerVisible(true)
      }
    }

    const onAppInstalled = () => {
      setInstallPrompt(null)
      setIsStandalone(true)
      setIsBannerVisible(false)
      setIsDismissed(true)
      localStorage.setItem(DISMISS_KEY, 'true')
    }

    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    const displayModeQuery = window.matchMedia('(display-mode: standalone)')
    const onDisplayModeChange = () => setIsStandalone(isStandaloneMode())

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    displayModeQuery.addEventListener('change', onDisplayModeChange)
    void syncPushSubscription()

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      displayModeQuery.removeEventListener('change', onDisplayModeChange)
    }
  }, [isDismissed])

  const enableNotifications = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      throw new Error('Push notifications are not supported in this browser')
    }

    const config = await fetchPushConfig()
    if (!config.enabled || !config.public_key) {
      throw new Error('Push notifications are not configured on the server')
    }

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      throw new Error('Notification permission was not granted')
    }

    const registration = await navigator.serviceWorker.ready
    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.public_key),
      })
    }

    await upsertPushSubscription(subscription.toJSON(), isStandalone ? 'installed-pwa' : 'browser')
    setNotificationsEnabled(true)
  }

  const disableNotifications = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setNotificationsEnabled(false)
      return
    }

    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (subscription) {
      await deletePushSubscription(subscription.endpoint).catch(() => undefined)
      await subscription.unsubscribe().catch(() => undefined)
    }
    setNotificationsEnabled(false)
  }

  const showInstallNudge = () => {
    if (!isMobile || isStandalone) {
      return
    }

    setIsDismissed(false)
    localStorage.removeItem(DISMISS_KEY)
    setIsBannerVisible(Boolean(installPrompt) || isIos)
  }

  const dismissInstallNudge = () => {
    localStorage.setItem(DISMISS_KEY, 'true')
    setIsDismissed(true)
    setIsBannerVisible(false)
  }

  const promptInstall = async () => {
    if (!isMobile || isStandalone) {
      return
    }

    if (!installPrompt) {
      showInstallNudge()
      return
    }

    setIsBannerVisible(true)
    await installPrompt.prompt()
    const result = await installPrompt.userChoice

    if (result.outcome === 'accepted') {
      setInstallPrompt(null)
      setIsBannerVisible(false)
      setIsDismissed(true)
      localStorage.setItem(DISMISS_KEY, 'true')
      return
    }

    setIsBannerVisible(true)
  }

  const value: PwaContextValue = {
    canInstall: Boolean(installPrompt),
    isBannerVisible,
    isIos,
    isMobile,
    isOnline,
    isStandalone,
    notificationsEnabled,
    notificationsSupported,
    dismissInstallNudge,
    disableNotifications,
    enableNotifications,
    promptInstall,
    showInstallNudge,
  }

  return (
    <PwaContext.Provider value={value}>
      {children}
    </PwaContext.Provider>
  )
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0))
}

export function usePwa() {
  const value = useContext(PwaContext)

  if (!value) {
    throw new Error('usePwa must be used within a PwaProvider')
  }

  return value
}
