import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import { ClerkProvider } from '@clerk/nextjs'
import { ThemeProvider } from '@/lib/theme'
import { ToastProvider } from '@/components/ui/Toast'
import { Analytics } from "@vercel/analytics/next"
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Application Dashboard',
  icons: {
    icon: [
      {
        url: '/nenjo-logo-dark.png',
        sizes: '32x32',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/nenjo-logo-white.png',
        sizes: '32x32',
        media: '(prefers-color-scheme: dark)',
      },
    ],
    apple: [
      {
        url: '/nenjo-logo-dark.png',
        sizes: '180x180',
      },
    ],
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
        <Script id="nenjo-theme-init" strategy="beforeInteractive">
          {`
            (function(){
              try {
                var t = localStorage.getItem('nenjo-theme');
                var dark = t === 'dark' || (!t || t === 'system') && window.matchMedia('(prefers-color-scheme: dark)').matches;
                if (dark) document.documentElement.classList.add('dark');
              } catch(e){}
            })();
          `}
        </Script>
      </head>
      <body className={inter.className}>
        <ThemeProvider>
          {children}
          <ToastProvider />
          <Analytics />
        </ThemeProvider>
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
