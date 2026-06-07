import {
  ArrowLeft,
  BadgeDollarSign,
  Building2,
  LayoutDashboard,
  Mail,
  Sparkles,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

const NAV_LOGO = "/nenjo-logo-dark.png";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Nenjo Cloud pricing plans.",
};

const plans = [
  {
    name: "Hobbyist",
    price: "Free",
    note: "Limited storage",
    tone: "soft",
    features: [
      "1 harness/runtime",
      "1 organization member",
      "200 cloud chat messages retained (harness retains full session history)",
      "200 notifications retained",
      "50 activity rows retained",
      "50 execution runs retained",
    ],
  },
  {
    name: "Professional",
    price: "Coming Soon",
    note: "More room for active teams",
    tone: "featured",
    features: [
      "Increased cloud storage capacity",
      "Multiple harnesses and services",
      "User invites",
      "3 additional team members",
      "500 cloud chat messages retained",
      "500 notifications, activity rows, and execution runs retained",
    ],
  },
  {
    name: "Enterprise",
    price: "Contact Sales",
    note: "",
    tone: "quiet",
    features: [],
  },
];

export default function PricingPage() {
  return (
    <main className="nenjo-landing nenjo-light">
      <nav className="lp-nav" aria-label="Primary">
        <Link className="lp-brand" href="/" aria-label="Nenjo home">
          <Image src={NAV_LOGO} alt="" width={31} height={28} priority />
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
          Start with the hosted dashboard for free, then move into higher
          storage, multiple harnesses, services, and collaboration when the
          professional plan opens.
        </p>
      </section>

      <section className="lp-pricing-grid" aria-label="Pricing plans">
        {plans.map((plan) => (
          <article className={`lp-price-card ${plan.tone}`} key={plan.name}>
            <div className="lp-price-card-top">
              <div>
                <span className="lp-price-label">{plan.name}</span>
                <h2>{plan.price}</h2>
              </div>
              <PlanIcon tone={plan.tone} />
            </div>
            {plan.note ? <p className="lp-price-note">{plan.note}</p> : null}
            {plan.features.length > 0 ? (
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            ) : null}
            {plan.name === "Enterprise" ? (
              <a className="lp-button secondary" href="mailto:sales@nenjo.ai">
                <Mail size={18} />
                Contact sales
              </a>
            ) : (
              <Link className="lp-button primary" href="/dashboard/login">
                <LayoutDashboard size={18} />
                Get started
              </Link>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}

function PlanIcon({ tone }: { tone: string }) {
  if (tone === "featured") return <Sparkles size={24} />;
  if (tone === "quiet") return <Building2 size={24} />;
  return <BadgeDollarSign size={24} />;
}
