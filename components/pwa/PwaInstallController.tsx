"use client"

import { usePwa } from '@/components/pwa/PwaProvider'

export function PwaInstallController() {
  const { canInstall, dismissInstallNudge, isBannerVisible, promptInstall } = usePwa()

  if (!isBannerVisible) {
    return null
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4">
      <div className="pointer-events-auto mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-white/10 bg-[#07111d]/92 px-4 py-3 text-white shadow-[0_18px_60px_rgba(0,0,0,0.35)] backdrop-blur-md">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Install Nenjo</p>
          <p className="text-xs text-white/70">
            {canInstall
              ? 'Add the dashboard to your home screen for a full-screen mobile app.'
              : 'On iPhone, tap Share and then Add to Home Screen.'}
          </p>
        </div>
        {canInstall && (
          <button
            type="button"
            onClick={() => void promptInstall()}
            className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#07111d] transition-opacity hover:opacity-90"
          >
            Install
          </button>
        )}
        <button
          type="button"
          onClick={dismissInstallNudge}
          className="shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/70 transition-colors hover:border-white/25 hover:text-white"
          aria-label="Dismiss install prompt"
        >
          Not now
        </button>
      </div>
    </div>
  )
}
