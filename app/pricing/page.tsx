import {
  ArrowLeft,
  BookOpen,
  Github,
  LayoutDashboard,
  Play,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { PricingPlanGrid } from "@/components/pricing/PricingPlanGrid";
import { pageSocialMetadata } from "@/lib/seo/metadata";
import { buildPricingSchemaGraph } from "@/lib/seo/pricing-schema";

const NAV_LOGO = "/nenjo-logo-dark.png";

const PRICING_DESCRIPTION =
  "Free Nenjo Cloud tier with one worker harness and encrypted workspace. Team plans coming soon. Open-source runtime you can inspect and extend — connected to the platform today.";

export const metadata: Metadata = {
  title: "Pricing — Nenjo Cloud",
  description: PRICING_DESCRIPTION,
  alternates: { canonical: "/pricing" },
  ...pageSocialMetadata({
    path: "/pricing",
    title: "Pricing — Nenjo Cloud",
    description: PRICING_DESCRIPTION,
  }),
};

const architectureRows = [
  {
    label: "Price",
    cloud: "Free (Hobbyist) · Pro coming soon",
    worker: "Included — runs on your machines",
  },
  {
    label: "What it does",
    cloud: "Dashboard, onboarding, packages, live updates",
    worker: "Executes agents, tools, and routines where your data lives",
  },
  {
    label: "Where it runs",
    cloud: "Hosted by Nenjo",
    worker: "Your infrastructure",
  },
  {
    label: "Trust boundary",
    cloud: "Stores ciphertext only; can't read your content",
    worker: "Your data and policies stay on your side",
  },
  {
    label: "Open source",
    cloud: "Platform backend isn't fully self-hostable today",
    worker: "Runtime crates are open source on GitHub",
  },
  {
    label: "Get started",
    cloud: "Start free",
    cloudHref: "/dashboard/login",
    worker: "Installation",
    workerHref: "/docs/introduction/installation",
  },
];

const faqItems = [
  {
    question: "Is Nenjo free?",
    answer:
      "Yes — the Hobbyist tier is free with the limits listed above. Professional pricing isn't live yet.",
  },
  {
    question: "Can Nenjo read my prompts and documents?",
    answer:
      "No. Material is encrypted client-side before it reaches the platform. The platform stores and routes ciphertext it cannot read.",
    link: { href: "/docs/platform/security", label: "Read the security model" },
  },
  {
    question: "What's a harness / worker?",
    answer:
      "Your nenjo run process on your machines — where agents actually execute. The free tier includes one. It connects to Nenjo Cloud for coordination and live updates.",
  },
  {
    question: "Can I use Nenjo without Nenjo Cloud?",
    answer:
      "Not today. Workers currently require a Nenjo Cloud workspace. The runtime is open source so you can inspect and extend it; running fully offline or self-hosting the control plane isn't supported yet.",
  },
  {
    question: "What's open source then?",
    answer:
      "The Rust runtime, package primitives, manifests, and SDK on GitHub. You can read the code, run workers against Cloud, and contribute. Decoupling workers from the hosted platform is a goal, not a current option.",
    link: {
      href: "https://github.com/nenjo-ai/nenjo",
      label: "View on GitHub",
      external: true,
    },
  },
  {
    question: "What happens when I hit a retention limit?",
    answer:
      "Older cloud-stored rows drop from the dashboard view; your harness retains full session history on the worker. You're not locked out of the product.",
  },
  {
    question: "When is Professional available?",
    answer:
      "Not self-serve yet. Use Join waitlist on the Professional plan card and we'll email you when team plans open.",
  },
  {
    question: "Who is Enterprise for?",
    answer:
      "Teams that need a security walkthrough, have custom retention or deployment questions, or want to talk through procurement before adopting. Email sales@nenjo.ai.",
  },
  {
    question: "Is a credit card required?",
    answer: "Not for the free Hobbyist tier.",
  },
];

export default function PricingPage() {
  return (
    <main className="nenjo-landing nenjo-light">
      <JsonLd data={buildPricingSchemaGraph()} />
      <nav className="lp-nav" aria-label="Primary">
        <Link className="lp-brand" href="/" aria-label="Nenjo home">
          <Image src={NAV_LOGO} alt="Nenjo" width={31} height={28} priority />
          <span>Nenjo</span>
        </Link>
        <div className="lp-nav-current" aria-live="polite">
          Pricing
        </div>
        <div className="lp-nav-actions">
          <Link className="lp-nav-ghost" href="/">
            <ArrowLeft size={16} />
            Home
          </Link>
          <Link className="lp-nav-ghost" href="/docs">
            <BookOpen size={16} />
            Docs
          </Link>
          <Link className="lp-nav-cta" href="/dashboard/login">
            <LayoutDashboard size={16} />
            Enter
          </Link>
        </div>
      </nav>

      <section className="lp-pricing-hero">
        <span className="lp-eyebrow">Pricing</span>
        <h1>Simple plans while Nenjo Cloud grows up.</h1>
        <p>
          Start free with the encrypted dashboard and one worker on your
          infrastructure. Nenjo&apos;s runtime is open source and today runs{" "}
          <strong>with</strong> Nenjo Cloud; standalone operation without the
          platform is on the roadmap.
        </p>
      </section>

      <PricingPlanGrid />

      <section className="lp-section" aria-labelledby="pricing-architecture">
        <div className="lp-section-head">
          <span className="lp-eyebrow">Architecture</span>
          <h2 id="pricing-architecture">Your workers. Our control plane. Both required today.</h2>
          <p>
            Nenjo splits the problem in two: a hosted control plane (dashboard,
            packages, coordination, live sync) and a worker runtime (
            <code>nenjo run</code>) on infrastructure you control. Today,
            workers connect to Nenjo Cloud — standalone mode without the
            platform isn&apos;t available yet.
          </p>
        </div>

        <div className="lp-compare-table-wrap">
          <table className="lp-compare-table">
            <thead>
              <tr>
                <th scope="col" />
                <th scope="col">Nenjo Cloud (control plane)</th>
                <th scope="col">Worker (nenjo run)</th>
              </tr>
            </thead>
            <tbody>
              {architectureRows.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td>
                    {row.cloudHref ? (
                      <Link href={row.cloudHref}>{row.cloud}</Link>
                    ) : (
                      row.cloud
                    )}
                  </td>
                  <td>
                    {row.workerHref ? (
                      <Link href={row.workerHref}>{row.worker}</Link>
                    ) : (
                      row.worker
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="lp-pricing-detail-foot">
          You&apos;re not uploading agents to someone else&apos;s black box — you
          run workers you control, coordinated through an encrypted control
          plane. Standalone <code>nenjo run</code> without Cloud is something
          we&apos;re working toward; this page will update when it ships.
        </p>
      </section>

      <section className="lp-section" aria-labelledby="pricing-retention">
        <div className="lp-section-head">
          <span className="lp-eyebrow">Limits explained</span>
          <h2 id="pricing-retention">
            Cloud retention is a convenience cap — not a lock on your history.
          </h2>
          <p>
            The numbers on each plan describe how much history Nenjo Cloud{" "}
            <strong>stores</strong> for the dashboard experience — not what your
            harness forgets. Your worker keeps full session history locally.
            When a cloud retention limit is reached, older dashboard-visible rows
            roll off the hosted copy; your harness and local runtime are
            unaffected.
          </p>
          <p>
            As of June 2026, Hobbyist limits are: 200 cloud chat messages, 200
            notifications, 50 activity rows, and 50 execution runs per
            organization. Limits may change when Professional launches —
            we&apos;ll date-stamp updates on this page.
          </p>
          <p>
            <Link href="/docs/platform/security">
              How security and encryption work →
            </Link>
          </p>
        </div>
      </section>

      <section className="lp-section" aria-labelledby="pricing-faq">
        <div className="lp-section-head">
          <span className="lp-eyebrow">Questions</span>
          <h2 id="pricing-faq">Common questions</h2>
        </div>
        <dl className="lp-faq-list">
          {faqItems.map((item) => (
            <div className="lp-faq-item" key={item.question}>
              <dt>{item.question}</dt>
              <dd>
                {item.answer}
                {item.link ? (
                  <>
                    {" "}
                    {item.link.external ? (
                      <a
                        href={item.link.href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {item.link.label} →
                      </a>
                    ) : (
                      <Link href={item.link.href}>{item.link.label} →</Link>
                    )}
                  </>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="lp-cta" aria-labelledby="pricing-cta">
        <h2 id="pricing-cta">Connect a worker. Keep your data close.</h2>
        <p>
          Create a free workspace, install the harness on your infrastructure,
          and run agents through an encrypted control plane — without handing
          Nenjo the keys to your content.
        </p>
        <div className="lp-actions centered">
          <Link className="lp-button primary" href="/dashboard/login">
            <LayoutDashboard size={18} />
            Start free
          </Link>
          <Link className="lp-button secondary" href="/docs">
            <Play size={18} />
            Read the docs
          </Link>
          <a
            className="lp-button secondary"
            href="https://github.com/nenjo-ai/nenjo"
            target="_blank"
            rel="noreferrer"
          >
            <Github size={18} />
            View on GitHub
          </a>
        </div>
      </section>

      <footer className="lp-footer">
        <div>
          <span>Nenjo</span>
          <p>Open source runtime. Managed control plane.</p>
        </div>
        <div className="lp-footer-links">
          <Link href="/pricing">Pricing</Link>
          <a href="mailto:hello@nenjo.ai">hello@nenjo.ai</a>
          <Link href="/privacy">Privacy</Link>
          <Link href="/cookies">Cookies</Link>
          <a href="#" className="termly-display-preferences">
            Cookie Preferences
          </a>
          <Link href="/terms">Terms</Link>
        </div>
      </footer>
    </main>
  );
}