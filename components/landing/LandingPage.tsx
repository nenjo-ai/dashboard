"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Inline SVG icons (geometric, no emojis)
// ---------------------------------------------------------------------------

function DiamondIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 2L22 12L12 22L2 12Z" />
    </svg>
  );
}

function HexagonIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 2L21 7V17L12 22L3 17V7Z" />
    </svg>
  );
}

function CircleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

function TriangleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 3L22 21H2Z" />
    </svg>
  );
}

function SquareIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" />
    </svg>
  );
}

function OctagonIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M8 2H16L22 8V16L16 22H8L2 16V8Z" />
    </svg>
  );
}

function CrosshairIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 2V6M12 18V22M2 12H6M18 12H22" />
    </svg>
  );
}

function PentagonIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 2L22 9.5L18.5 21H5.5L2 9.5Z" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      className="ml-2 inline h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Clipped card — diagonal cuts on top-left and bottom-right corners
// ---------------------------------------------------------------------------

const CLIP_SIZE = 14; // px size of the corner cut

function ClippedCard({
  children,
  className = "",
  as: Tag = "div",
  href,
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | typeof Link;
  href?: string;
}) {
  // SVG polygon clip-path: rectangle with top-left and bottom-right corners sliced
  const clipPath = `polygon(${CLIP_SIZE}px 0, 100% 0, 100% calc(100% - ${CLIP_SIZE}px), calc(100% - ${CLIP_SIZE}px) 100%, 0 100%, 0 ${CLIP_SIZE}px)`;

  const content = (
    <>
      {/* Border layer — slightly larger, clipped the same way */}
      <div
        className="absolute inset-0 transition-all duration-300"
        style={{ clipPath }}
      >
        <div className="absolute inset-0 border border-white/25 transition-all duration-300 group-hover:border-[#4fc3f7]/40" style={{ clipPath }} />
      </div>
      {/* Content */}
      <div className="relative z-10">{children}</div>
    </>
  );

  const baseClass = `group relative p-8 transition-all duration-300 hover:shadow-[0_0_20px_rgba(79,195,247,0.08)] ${className}`;

  if (Tag === Link && href) {
    return (
      <Link href={href} className={baseClass} style={{ clipPath }}>
        {content}
      </Link>
    );
  }

  return (
    <div className={baseClass} style={{ clipPath }}>
      {content}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section label with ruled lines
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="mb-16 flex items-center justify-center gap-4">
      <div className="h-px w-16 bg-white/20 sm:w-24" />
      <span className="text-xs font-light tracking-[0.3em] text-white/50" style={{ fontFamily: "monospace" }}>
        {children}
      </span>
      <div className="h-px w-16 bg-white/20 sm:w-24" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Intersection Observer hook for fade-in
// ---------------------------------------------------------------------------

function useFadeIn() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

// ---------------------------------------------------------------------------
// Navbar
// ---------------------------------------------------------------------------

function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-black/70 backdrop-blur-md" : "bg-transparent"
      }`}
      style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-3">
          <Image
            src="/nenjo-logo-white.png"
            alt="Nenjo"
            width={28}
            height={28}
            style={{ height: "auto" }}
          />
          <span className="text-sm font-light tracking-[0.25em] text-white uppercase">Nenjo</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          <a
            href="#features"
            className="text-xs tracking-widest text-white/60 transition-colors hover:text-white uppercase"
          >
            Features
          </a>
          <Link
            href="/docs"
            className="text-xs tracking-widest text-white/60 transition-colors hover:text-white uppercase"
          >
            Docs
          </Link>
          <a
            href="https://github.com/nenjo-ai/nenjo"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/60 transition-colors hover:text-white"
            aria-label="GitHub"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
          </a>
        </div>

        <Link
          href="/dashboard/login"
          className="border border-white/30 px-5 py-1.5 text-xs font-light tracking-[0.2em] text-white/70 uppercase transition-all duration-300 hover:border-[#4fc3f7]/40 hover:text-white hover:shadow-[0_0_15px_rgba(79,195,247,0.15)]"
        >
          Enter
        </Link>
      </div>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function HeroSection() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
      {/* Background radial gradient */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 60% 50% at 50% 40%, #0a1628 0%, #0d0d2b 40%, #000 80%)",
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-col items-center">
        {/* Logo */}
        <div className="mb-12 self-center">
          <Image
            src="/nenjo-logo-white.png"
            alt="Nenjo"
            width={200}
            height={200}
            priority
            style={{ height: "auto" }}
          />
        </div>

        {/* Beta badge */}
        <div
          className="mb-6 border border-white/25 px-4 py-1"
          style={{ fontFamily: "monospace" }}
        >
          <span className="text-[10px] tracking-[0.4em] text-white/50 uppercase">Beta</span>
        </div>

        <div className="flex w-full max-w-3xl flex-col items-center text-center">
          {/* Headline */}
          <h1 className="mb-6 text-4xl font-extralight leading-tight tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl">
            The agent-first
            <br />
            platform.
          </h1>

          {/* Subheadline */}
          <p className="mb-10 max-w-3xl text-base font-light text-white/60 sm:text-lg">
            Nenjo is an agent-first platform for teams building real agent products. Define agents
            as files, update them live while the system runs, and build environments where agents
            can work within the platform itself.
          </p>
        </div>

        {/* CTA */}
        <div className="flex flex-col gap-4 sm:flex-row">
          <Link
            href="/dashboard/login"
            className="border border-white/30 px-10 py-3 text-xs font-light tracking-[0.3em] text-white/80 uppercase transition-all duration-300 hover:border-[#4fc3f7]/40 hover:text-white hover:shadow-[0_0_25px_rgba(79,195,247,0.2)]"
          >
            Enter Nenjo
          </Link>
          <Link
            href="/docs/getting-started/architecture"
            className="border border-white/10 px-10 py-3 text-xs font-light tracking-[0.3em] text-white/55 uppercase transition-all duration-300 hover:border-white/25 hover:text-white"
          >
            Read Architecture
          </Link>
        </div>
      </div>
    </section>
  );
}

const proofPoints = [
  { label: "Platform model", value: "Agent-first" },
  { label: "Configuration", value: "Agents as files" },
  { label: "Update model", value: "Real-time hot-swap" },
  { label: "Coordination", value: "Multi-agent by design" },
];

function ProofStrip() {
  const { ref, visible } = useFadeIn();

  return (
    <section className="-mt-20 px-4 pb-8">
      <div
        ref={ref}
        className={`mx-auto grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-4 transition-all duration-700 ${
          visible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
        }`}
      >
        {proofPoints.map((item) => (
          <ClippedCard key={item.label} className="bg-white/[0.02] p-5">
            <div className="mb-2 text-[10px] tracking-[0.25em] text-white/35 uppercase" style={{ fontFamily: "monospace" }}>
              {item.label}
            </div>
            <div className="text-sm font-light tracking-wide text-white">{item.value}</div>
          </ClippedCard>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

const features = [
  {
    icon: <DiamondIcon />,
    title: "Agent-First By Design",
    description:
      "Built so agents can inspect, coordinate, and operate within the platform itself, not just answer prompts inside a hosted runtime.",
  },
  {
    icon: <HexagonIcon />,
    title: "Agents As Files",
    description:
      "Define agents in manifest files that can be versioned, reviewed, reproduced, and moved with your codebase instead of disappearing into vendor-managed state.",
  },
  {
    icon: <TriangleIcon />,
    title: "Real-Time Hot-Swap",
    description:
      "Push agent and routine updates live so long-running workers pick up new configuration without full redeploys or cold restarts.",
  },
  {
    icon: <OctagonIcon />,
    title: "Multi-Agent Orchestration",
    description:
      "Go beyond single-agent hosting with delegation, routines, gates, councils, cron, and event-driven coordination.",
  },
  {
    icon: <CircleIcon />,
    title: "Portable In Nature",
    description:
      "Stay flexible across providers, runtimes, and environments instead of rebuilding product behavior around a single hosted stack.",
  },
  {
    icon: <PentagonIcon />,
    title: "Durable Agent Context",
    description:
      "Give long-running workers memory, resource access, and execution context that survives beyond one stateless session.",
  },
];

function FeaturesSection() {
  const { ref, visible } = useFadeIn();

  return (
    <section id="features" className="scroll-mt-20 px-4 py-32">
      <div className="mx-auto max-w-6xl">
        <SectionLabel>CAPABILITIES</SectionLabel>

        <div
          ref={ref}
          className={`grid gap-6 sm:grid-cols-2 lg:grid-cols-3 transition-all duration-700 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {features.map((f) => (
            <ClippedCard key={f.title}>
              <div className="mb-5 text-white/50 transition-colors group-hover:text-[#4fc3f7]/70">
                {f.icon}
              </div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-light tracking-wide text-white">
                {f.title}
              </h3>
              <p className="text-xs font-light leading-relaxed text-white/40">
                {f.description}
              </p>
            </ClippedCard>
          ))}
        </div>
      </div>
    </section>
  );
}

const positioningPoints = [
  {
    icon: <CrosshairIcon />,
    title: "More than hosted agents",
    description:
      "Nenjo manages agents, routines, scopes, tools, manifests, and live runtime behavior. The product is the operating model, not just the interface wrapped around it.",
  },
  {
    icon: <SquareIcon />,
    title: "Live systems, not static setup",
    description:
      "Nenjo is built for systems that keep running. Agents, routines, and workers can evolve through live hot-swapped updates instead of rigid redeploy cycles.",
  },
  {
    icon: <DiamondIcon />,
    title: "Nenji makes it concrete",
    description:
      "Nenjo is the platform. Nenji shows what it enables: an agent that can work within the system itself and make the agent-first model tangible.",
  },
];

function WhyNenjoSection() {
  const { ref, visible } = useFadeIn();

  return (
    <section className="px-4 py-32">
      <div className="mx-auto max-w-6xl">
        <SectionLabel>POSITIONING</SectionLabel>

        <div className="mb-14 max-w-3xl">
          <h2 className="mb-5 text-3xl font-extralight tracking-tight text-white sm:text-4xl">
            Built beyond single-agent hosting
          </h2>
          <p className="text-base font-light leading-relaxed text-white/55 sm:text-lg">
            Most platforms help you launch agents. Nenjo is for teams building living systems:
            agents defined as files, updated in real time, and embedded in the operating model of
            the product itself.
          </p>
        </div>

        <div
          ref={ref}
          className={`grid gap-6 lg:grid-cols-3 transition-all duration-700 ${
            visible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
          }`}
        >
          {positioningPoints.map((item) => (
            <ClippedCard key={item.title} className="bg-white/[0.02]">
              <div className="mb-5 text-white/50 transition-colors group-hover:text-[#4fc3f7]/70">
                {item.icon}
              </div>
              <h3 className="mb-3 text-sm font-light tracking-wide text-white">{item.title}</h3>
              <p className="text-sm font-light leading-relaxed text-white/42">{item.description}</p>
            </ClippedCard>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Architecture diagram
// ---------------------------------------------------------------------------

function ArchitectureSection() {
  const { ref, visible } = useFadeIn();

  return (
    <section className="px-4 py-32">
      <div className="mx-auto max-w-4xl">
        <SectionLabel>ARCHITECTURE</SectionLabel>

        <div
          ref={ref}
          className={`flex items-center justify-center gap-0 transition-all duration-700 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {/* User node */}
          <div className="flex flex-col items-center">
            <div className="flex h-20 w-20 items-center justify-center border border-white/25 sm:h-24 sm:w-24">
              <span className="text-[10px] tracking-[0.2em] text-white/50 uppercase">User</span>
            </div>
          </div>

          {/* Connector line */}
          <div className="h-px w-10 bg-white/25 sm:w-16" />

          {/* Nenjo node (highlighted) */}
          <div className="flex flex-col items-center">
            <div className="flex h-20 w-20 items-center justify-center border border-[#4fc3f7]/25 shadow-[0_0_20px_rgba(79,195,247,0.1)] sm:h-24 sm:w-24">
              <span className="text-[10px] tracking-[0.2em] text-[#4fc3f7]/70 uppercase">Control</span>
            </div>
          </div>

          {/* Connector line */}
          <div className="h-px w-10 bg-white/25 sm:w-16" />

          {/* Agents node */}
          <div className="flex flex-col items-center">
            <div className="flex h-20 w-20 items-center justify-center border border-white/25 sm:h-24 sm:w-24">
              <span className="text-[10px] tracking-[0.2em] text-white/50 uppercase">Workers</span>
            </div>
          </div>
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-xs font-light leading-relaxed tracking-wide text-white/30">
          Nenjo sits above the worker network so agents can coordinate, receive live
          manifest-driven updates, and keep operating without waiting for the whole system to be
          redeployed.
        </p>
      </div>
    </section>
  );
}

function NenjiSection() {
  const { ref, visible } = useFadeIn();

  return (
    <section className="px-4 py-32">
      <div className="mx-auto max-w-5xl">
        <SectionLabel>NENJI</SectionLabel>

        <div
          ref={ref}
          className={`grid gap-8 lg:grid-cols-[1.1fr_0.9fr] transition-all duration-700 ${
            visible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
          }`}
        >
          <ClippedCard className="bg-white/[0.02]">
            <h2 className="mb-5 text-3xl font-extralight tracking-tight text-white sm:text-4xl">
              Nenjo is the platform.
              <br />
              Nenji shows what it enables.
            </h2>
            <p className="max-w-2xl text-base font-light leading-relaxed text-white/55 sm:text-lg">
              Nenji gives the agent-first idea a concrete shape. It is the example of an agent that
              does more than answer prompts: it can inspect, configure, coordinate, and operate
              within the system itself.
            </p>
          </ClippedCard>

          <ClippedCard className="bg-white/[0.02]">
            <div className="mb-3 text-[10px] tracking-[0.25em] text-[#4fc3f7]/70 uppercase" style={{ fontFamily: "monospace" }}>
              Why It Matters
            </div>
            <div className="space-y-4 text-sm font-light leading-relaxed text-white/48">
              <p>Nenji makes the platform feel real instead of theoretical.</p>
              <p>It gives users a concrete picture of an agent that can inspect, coordinate, and operate within the system it lives in.</p>
              <p>That turns the idea of an agent-first platform from an abstract claim into something legible, memorable, and easy to imagine building with.</p>
            </div>
          </ClippedCard>
        </div>
      </div>
    </section>
  );
}

const comparisonRows = [
  {
    label: "Primary product shape",
    nenjo: "An agent-first platform for multi-agent systems, live updates, and platform-level operability",
    generic: "A hosted agent product, managed runtime, or agent framework focused on getting one agent running quickly",
  },
  {
    label: "Configuration model",
    nenjo: "Agents can be defined in manifest files, versioned in your repo, and moved across environments",
    generic: "Configuration often lives in hosted settings, templates, dashboards, or framework-specific runtime code",
  },
  {
    label: "Update model",
    nenjo: "Long-running workers can pick up hot-swapped agent and routine changes while the system stays live",
    generic: "Configuration changes often depend on manual redeploys, restarts, or hosted platform update flows",
  },
  {
    label: "Portability",
    nenjo: "Portable across providers, runtimes, and deployment models without locking product behavior to one vendor",
    generic: "Often centered on one vendor runtime, one hosting model, or one framework's assumptions",
  },
];

function ComparisonSection() {
  const { ref, visible } = useFadeIn();

  return (
    <section className="px-4 py-32">
      <div className="mx-auto max-w-6xl">
        <div className="mb-14 max-w-3xl">
          <h2 className="mb-5 text-3xl font-extralight tracking-tight text-white sm:text-4xl">
            Built for teams who want more than setup speed
          </h2>
          <p className="text-base font-light leading-relaxed text-white/55 sm:text-lg">
            Some products optimize for managed convenience, templates, or framework ergonomics.
            Nenjo is for teams that want agent configuration as files, live runtime evolution, and a
            system architecture that does not collapse into vendor lock-in.
          </p>
        </div>

        <div
          ref={ref}
          className={`overflow-hidden border border-white/10 transition-all duration-700 ${
            visible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
          }`}
        >
          <div className="grid grid-cols-1 border-b border-white/10 bg-white/[0.02] text-[11px] tracking-[0.25em] text-white/35 uppercase md:grid-cols-[1.1fr_1fr_1fr]" style={{ fontFamily: "monospace" }}>
            <div className="px-5 py-4">Axis</div>
            <div className="px-5 py-4 text-[#4fc3f7]/70">Nenjo</div>
            <div className="px-5 py-4">Typical Alternative</div>
          </div>
          {comparisonRows.map((row) => (
            <div key={row.label} className="grid grid-cols-1 border-b border-white/10 last:border-b-0 md:grid-cols-[1.1fr_1fr_1fr]">
              <div className="px-5 py-5 text-sm font-light text-white">{row.label}</div>
              <div className="px-5 py-5 text-sm font-light leading-relaxed text-white/70">{row.nenjo}</div>
              <div className="px-5 py-5 text-sm font-light leading-relaxed text-white/38">{row.generic}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Docs
// ---------------------------------------------------------------------------

const docLinks = [
  {
    title: "Quickstart Guide",
    description: "Start the stack, connect a worker, and boot your first agent.",
    href: "/docs/getting-started/quickstart",
  },
  {
    title: "Architecture",
    description: "See how the control plane, workers, NATS, and storage fit together.",
    href: "/docs/getting-started/architecture",
  },
  {
    title: "MCP Integration",
    description: "Understand how agents get scoped platform access and external MCP tools.",
    href: "/docs/agents/mcp-integration",
  },
  {
    title: "Worker Runtime",
    description: "Learn how workers bootstrap, hot-swap config, and execute long-running tasks.",
    href: "/docs/system/worker",
  },
];

function DocsSection() {
  const { ref, visible } = useFadeIn();

  return (
    <section id="docs" className="scroll-mt-20 px-4 py-32">
      <div className="mx-auto max-w-4xl">
        <SectionLabel>DOCUMENTATION</SectionLabel>

        <div
          ref={ref}
          className={`grid gap-4 sm:grid-cols-2 transition-all duration-700 ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
          }`}
        >
          {docLinks.map((link) => (
            <ClippedCard key={link.title} as={Link} href={link.href} className="flex items-center justify-between p-6">
              <div>
                <h3 className="mb-1 text-sm font-light tracking-wide text-white">
                  {link.title}
                </h3>
                <p className="text-xs font-light text-white/40">
                  {link.description}
                </p>
              </div>
              <ArrowIcon />
            </ClippedCard>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCtaSection() {
  return (
    <section className="px-4 py-32">
      <div className="mx-auto max-w-5xl">
        <ClippedCard className="bg-white/[0.03] px-8 py-14 text-center sm:px-14">
          <h2 className="mb-5 text-3xl font-extralight tracking-tight text-white sm:text-5xl">
            Own the agent stack.
            <br />
            Build beyond hosted agents.
          </h2>
          <p className="mx-auto mb-10 max-w-3xl text-base font-light leading-relaxed text-white/52 sm:text-lg">
            Nenjo gives teams an agent-first platform with agents defined as files, real-time hot-swapped
            updates, and durable multi-agent coordination. Build systems where agents do more than
            run. Build systems they can help operate.
          </p>
          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Link
              href="/dashboard/login"
              className="border border-white/30 px-10 py-3 text-xs font-light tracking-[0.3em] text-white/80 uppercase transition-all duration-300 hover:border-[#4fc3f7]/40 hover:text-white hover:shadow-[0_0_25px_rgba(79,195,247,0.2)]"
            >
              Enter Nenjo
            </Link>
            <Link
              href="/docs/getting-started/quickstart"
              className="border border-white/10 px-10 py-3 text-xs font-light tracking-[0.3em] text-white/55 uppercase transition-all duration-300 hover:border-white/25 hover:text-white"
            >
              Read Quickstart
            </Link>
          </div>
        </ClippedCard>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function Footer() {
  return (
    <footer style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }} className="px-6 py-8">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <span className="text-xs font-light tracking-[0.25em] text-white/50 uppercase">Nenjo</span>
        <span className="text-xs font-light text-white/40">&copy; {new Date().getFullYear()} Boon Labs LLC</span>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// Main LandingPage
// ---------------------------------------------------------------------------

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#000000] text-white" style={{ background: "linear-gradient(180deg, #050510 0%, #000 100%)" }}>
      <Navbar />
      <HeroSection />
      <ProofStrip />
      <FeaturesSection />
      <WhyNenjoSection />
      <ArchitectureSection />
      <NenjiSection />
      <ComparisonSection />
      <DocsSection />
      <FinalCtaSection />
      <Footer />
    </div>
  );
}

export default LandingPage;
