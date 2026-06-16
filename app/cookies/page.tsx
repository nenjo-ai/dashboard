import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { NenjoLogoMark } from "@/components/layout/NenjoLogoMark";
import { pageSocialMetadata } from "@/lib/seo/metadata";

const COOKIES_DESCRIPTION =
  "How Nenjo uses cookies and similar technologies on nenjo.ai, including authentication, preferences, and analytics.";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: COOKIES_DESCRIPTION,
  alternates: { canonical: "/cookies" },
  ...pageSocialMetadata({
    path: "/cookies",
    title: "Cookie Policy",
    description: COOKIES_DESCRIPTION,
  }),
};

async function getCookiePolicyHtml() {
  return readFile(
    path.join(process.cwd(), "app/cookies/termly-cookies.html"),
    "utf8",
  );
}

export default async function CookiePolicyPage() {
  const cookiePolicyHtml = await getCookiePolicyHtml();

  return (
    <main className="min-h-screen bg-[#f4f6fb] px-6 py-10 text-gray-900 dark:bg-[#05070f] dark:text-white">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-3 transition-colors hover:text-[#b8841a]"
          >
            <NenjoLogoMark className="h-10 w-10 rounded-lg" />
            <span className="text-sm font-light uppercase tracking-[0.25em]">
              Nenjo
            </span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link
              href="/privacy"
              className="text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
            >
              Terms of Service
            </Link>
          </nav>
        </header>

        <article
          className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-white"
          dangerouslySetInnerHTML={{ __html: cookiePolicyHtml }}
        />
      </div>
    </main>
  );
}
