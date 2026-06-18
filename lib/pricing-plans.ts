export type PricingPlanCta =
  | { kind: "link"; label: string; href: string }
  | { kind: "mailto"; label: string; href: string };

export type PricingPlan = {
  name: string;
  price: string;
  note: string;
  tone: "soft" | "featured" | "quiet";
  features: string[];
  finePrint?: string;
  cta: PricingPlanCta;
};

export const pricingPlans: PricingPlan[] = [
  {
    name: "Hobbyist",
    price: "Free",
    note: "Limited cloud storage · Best for builders getting started with Nenjo",
    tone: "soft",
    features: [
      "1 harness / runtime (runs on your infrastructure)",
      "1 organization member",
      "Encrypted dashboard + worker connection to Nenjo Cloud",
      "200 cloud chat messages retained (harness keeps full session history locally)",
      "200 notifications retained",
      "50 activity rows retained",
      "50 execution runs retained",
      "Open-source runtime (inspect, extend, contribute)",
      "Full documentation",
    ],
    finePrint: "No credit card required.",
    cta: { kind: "link", label: "Get started", href: "/dashboard/login" },
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
      "Early access to new features",
      "500 cloud chat messages retained",
      "500 notifications, activity rows, and execution runs retained",
    ],
    finePrint: "Professional isn't self-serve today.",
    cta: {
      kind: "mailto",
      label: "Contact us",
      href: "mailto:sales@nenjo.ai?subject=Professional%20plan",
    },
  },
  {
    name: "Enterprise",
    price: "Contact Sales",
    note: "Commercial terms, security review, and deployment support",
    tone: "quiet",
    features: [
      "Commercial licensing & custom agreements",
      "Platform + worker architecture review",
      "Self-hosted workers on your infrastructure",
      "Custom cloud retention and org policies (as available)",
      "Procurement and deployment questions",
      "Direct line to the team building Nenjo",
    ],
    finePrint: "Enterprise isn't checkout today — it's a conversation.",
    cta: {
      kind: "mailto",
      label: "Contact sales",
      href: "mailto:sales@nenjo.ai",
    },
  },
];
