import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { ClerkProvider } from '@clerk/nextjs'
import { ThemeProvider } from '@/lib/theme'
import { PwaInstallController } from '@/components/pwa/PwaInstallController'
import { PwaProvider } from '@/components/pwa/PwaProvider'
import { ToastProvider } from '@/components/ui/Toast'
import { Analytics } from "@vercel/analytics/next"
import './globals.css'

const WEBSITE_UUID = '05016a17-3f9b-4d9a-97f7-989353c2fa40'
const SITE_URL = 'https://nenjo.ai'
const SITE_DESCRIPTION = 'Nenjo is a modular agentic control plane for building AI workers with native packages, Rust foundations, and infrastructure you control.'
const SITE_PREVIEW_TITLE = 'Nenjo - Modular agentic control plane'
const LINK_PREVIEW_IMAGE = '/link-preview-image.png?v=2'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Nenjo',
    template: '%s | Nenjo',
  },
  description: SITE_DESCRIPTION,
  applicationName: 'Nenjo',
  manifest: '/manifest.webmanifest',
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'Nenjo',
    title: SITE_PREVIEW_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: LINK_PREVIEW_IMAGE,
        width: 1200,
        height: 630,
        alt: 'Nenjo modular agentic control plane',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_PREVIEW_TITLE,
    description: SITE_DESCRIPTION,
    images: [LINK_PREVIEW_IMAGE],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Nenjo',
  },
  icons: {
    icon: [
      { url: '/pwa-icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/pwa-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: '/pwa-icon-192.png',
    apple: [
      {
        url: '/apple-touch-icon.png',
        sizes: '180x180',
      },
    ],
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#05070b" },
  ],
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
}

/**
 * Root layout wraps the entire app with ClerkProvider for authentication.
 *
 * Clerk requires `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` to be set. If it is
 * missing (e.g. during a CI build without secrets), the provider is skipped
 * so the build doesn't crash.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  const content = (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="color-scheme" content="light dark" />
        <meta name="theme-color" content="#f5f7fb" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#05070b" media="(prefers-color-scheme: dark)" />
        <Script id="nenjo-theme-init" strategy="beforeInteractive">
          {`
            (function(){
              try {
                var t = localStorage.getItem('nenjo-theme');
                var docs = window.location.pathname === '/docs' || window.location.pathname.indexOf('/docs/') === 0;
                var dark = t === 'dark' || (!t && docs) || (!t || t === 'system') && window.matchMedia('(prefers-color-scheme: dark)').matches;
                if (dark) {
                  document.documentElement.classList.add('dark');
                  document.documentElement.style.colorScheme = 'dark';
                } else {
                  document.documentElement.style.colorScheme = 'light';
                }
              } catch(e){}
            })();
          `}
        </Script>
      </head>
      <body>
        <PwaProvider>
          <ThemeProvider>
            {children}
            <PwaInstallController />
            <ToastProvider />
            <Script
              id="termly-cmp"
              src="https://app.termly.io/embed.min.js"
              data-website-uuid={WEBSITE_UUID}
              strategy="afterInteractive"
            />
            <Analytics />
          </ThemeProvider>
        </PwaProvider>
      </body>
    </html>
  );

  // If Clerk publishable key is not set, render without ClerkProvider
  // (allows builds to succeed without secrets)
  if (!clerkKey) {
    return content;
  }

  return (
    <ClerkProvider
      publishableKey={clerkKey}
      signInUrl="/dashboard/login"
      signUpUrl="/dashboard/signup"
      signInFallbackRedirectUrl="/dashboard/onboarding"
      signUpFallbackRedirectUrl="/dashboard/onboarding"
      afterSignOutUrl="/"
    >
      {content}
    </ClerkProvider>
  )
}
