"use client"

import Link from "next/link"

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#10233b_0%,#07111d_42%,#030712_100%)] px-6 text-white">
      <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-white/5 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-md">
        <div className="mb-5 inline-flex rounded-full border border-white/15 px-3 py-1 text-[11px] uppercase tracking-[0.28em] text-white/60">
          Offline
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Nenjo needs a connection.</h1>
        <p className="mt-3 text-sm leading-6 text-white/70">
          The mobile shell is installed, but this dashboard still depends on live auth, API data,
          and worker connections. Reconnect to continue where you left off.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-[#07111d] transition-opacity hover:opacity-90"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-full border border-white/15 px-5 py-2.5 text-sm text-white/80 transition-colors hover:border-white/30 hover:text-white"
          >
            Open landing page
          </Link>
        </div>
      </div>
    </main>
  )
}
