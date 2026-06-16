import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { NenjoLogoMark } from "@/components/layout/NenjoLogoMark";
import { pageSocialMetadata } from "@/lib/seo/metadata";

const TERMS_DESCRIPTION =
  "Terms governing use of Nenjo Cloud, the open-source runtime, and related services operated by Boon Labs LLC.";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: TERMS_DESCRIPTION,
  alternates: { canonical: "/terms" },
  ...pageSocialMetadata({
    path: "/terms",
    title: "Terms of Service",
    description: TERMS_DESCRIPTION,
  }),
};

async function getTermsHtml() {
  return readFile(
    path.join(process.cwd(), "app/terms/termly-terms.html"),
    "utf8",
  );
}

export default async function TermsOfServicePage() {
  const termsHtml = await getTermsHtml();

  return (
    <main className="min-h-screen bg-[#f4f6fb] px-6 py-10 text-gray-900 dark:bg-[#05070f] dark:text-white">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10">
        <header className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-3 transition-colors hover:text-[#b8841a]"
          >
            <NenjoLogoMark className="h-10 w-10 rounded-lg" />
            <span className="text-sm font-light uppercase tracking-[0.25em]">
              Nenjo
            </span>
          </Link>
          <Link
            href="/privacy"
            className="text-sm text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
          >
            Privacy Policy
          </Link>
        </header>

        <article
          className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-white"
          dangerouslySetInnerHTML={{ __html: termsHtml }}
        />
      </div>
    </main>
  );
}
