import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { ClerkProvider } from '@clerk/nextjs'
import { ThemeProvider } from '@/lib/theme'
import { PwaInstallController } from '@/components/pwa/PwaInstallController'
import { PwaProvider } from '@/components/pwa/PwaProvider'
import { ToastProvider } from '@/components/ui/Toast'
import { Analytics } from "@vercel/analytics/next"
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Nenjo',
    template: '%s | Nenjo',
  },
  description: 'Nenjo is an agent-first platform for teams building real agent products.',
  applicationName: 'Nenjo',
  manifest: '/manifest.webmanifest',
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
                var dark = t === 'dark' || (!t || t === 'system') && window.matchMedia('(prefers-color-scheme: dark)').matches;
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
      signUpUrl="/dashboard/login"
      signInFallbackRedirectUrl="/dashboard/onboarding"
      signUpFallbackRedirectUrl="/dashboard/onboarding"
      afterSignOutUrl="/"
    >
      {content}
    </ClerkProvider>
  )
}
