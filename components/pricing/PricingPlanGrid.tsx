"use client";

import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import {
  BadgeDollarSign,
  Building2,
  LayoutDashboard,
  Mail,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { ClerkConfigurationNotice } from "@/components/auth/ClerkConfigurationNotice";
import { clerkWaitlistAppearance } from "@/lib/clerk-waitlist-appearance";
import { pricingPlans, type PricingPlan } from "@/lib/pricing-plans";

const CLERK_ENABLED = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

export function PricingPlanGrid() {
  return (
    <section className="lp-pricing-grid" aria-label="Pricing plans">
      {pricingPlans.map((plan) => (
        <PlanCard key={plan.name} plan={plan} />
      ))}
    </section>
  );
}

function PlanCard({ plan }: { plan: PricingPlan }) {
  return (
    <article className={`lp-price-card ${plan.tone}`}>
      <div className="lp-price-card-top">
        <div>
          <span className="lp-price-label">{plan.name}</span>
          <h2>{plan.price}</h2>
        </div>
        <PlanIcon tone={plan.tone} />
      </div>
      {plan.note ? <p className="lp-price-note">{plan.note}</p> : null}
      <ul>
        {plan.features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      <div className="lp-price-card-footer">
        <PlanCta plan={plan} />
        <p className="lp-price-fine-print">
          {plan.finePrint ?? "\u00a0"}
        </p>
      </div>
    </article>
  );
}

function PlanCta({ plan }: { plan: PricingPlan }) {
  if (plan.cta.kind === "link") {
    return (
      <Link className="lp-button primary" href={plan.cta.href}>
        <LayoutDashboard size={18} />
        {plan.cta.label}
      </Link>
    );
  }

  if (plan.cta.kind === "waitlist") {
    if (!CLERK_ENABLED) {
      return <ClerkConfigurationNotice compact />;
    }

    return <JoinWaitlistButton label={plan.cta.label} />;
  }

  return (
    <a className="lp-button secondary" href={plan.cta.href}>
      <Mail size={18} />
      {plan.cta.label}
    </a>
  );
}

function JoinWaitlistButton({ label }: { label: string }) {
  const { openWaitlist } = useClerk();

  return (
    <button
      type="button"
      className="lp-button primary"
      onClick={() =>
        openWaitlist({
          afterJoinWaitlistUrl: "/pricing",
          appearance: clerkWaitlistAppearance,
        })
      }
    >
      <UserPlus size={18} />
      {label}
    </button>
  );
}

function PlanIcon({ tone }: { tone: PricingPlan["tone"] }) {
  if (tone === "featured") return <Sparkles size={24} />;
  if (tone === "quiet") return <Building2 size={24} />;
  return <BadgeDollarSign size={24} />;
}