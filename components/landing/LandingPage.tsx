"use client";

/* eslint-disable @next/next/no-img-element */
import {
  BadgeDollarSign,
  BookOpen,
  Boxes,
  Braces,
  EyeOff,
  GitBranch,
  Github,
  Layers3,
  LayoutDashboard,
  Lock,
  Menu,
  Network,
  PackageCheck,
  Play,
  RefreshCcw,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const NAV_LOGO = "/nenjo-logo-dark.png";

const packages = [
  {
    icon: Network,
    title: "Knowledge graphs",
    body: "Turn documents and domain context into living concept graphs with metadata-first search, graph traversal, and relationships agents can actually use.",
  },
  {
    icon: Braces,
    title: "Runtime packages",
    body: "Ship agents, routines, abilities, tools, manifests, and policy as reusable units that move cleanly between projects and environments.",
  },
  {
    icon: RefreshCcw,
    title: "Live updates",
    body: "Hot-swap packages and manifests while workers keep running. Update behavior without restarts or dropped tasks all from your desktop or phone.",
  },
];

const layers = [
  {
    label: "Knowledge Layer",
    title: "Documents become graphs.",
    body: "Knowledge graphs organize documents into concepts, relationships, and metadata so agents retrieve context by meaning instead of guessing from flat chunks.",
    points: ["Concept graph traversal", "Metadata-first search", "Fresh context after package updates"],
  },
  {
    label: "Behavioral Layer",
    title: "Behavior ships as code.",
    body: "Runtime configuration packages keep agents, routines, tools, and policies portable. Version them, review them, and roll them forward like product infrastructure.",
    points: ["Portable manifests", "Explicit dependencies", "Runtime policy enforcement"],
  },
];

const builders = [
  {
    title: "Product developers",
    body: "Embed agents directly in your app with the SDK, then reuse the same packages across users, projects, and environments.",
    href: "/docs/harness/sdk",
    linkLabel: "Explore the SDK",
  },
  {
    title: "Personal AI Assistants",
    body: "Run workers for long-lived assistants, multi-step routines, and capability-scoped agent systems on infrastructure you control.",
    href: "/docs/getting-started/onboarding",
    linkLabel: "Start onboarding",
  },
  {
    title: "Consultants and teams",
    body: "Package repeatable client solutions once, adapt per deployment, and keep every install inspectable and maintainable on your workers.",
    href: "/docs/platform/security",
    linkLabel: "Read the security model",
  },
];

const primitives = [
  "Semantic versions",
  "Explicit dependencies",
  "Provider agnostic",
  "Transport agnostic",
  "Zero trust",
  "Embeddable SDK",
];

const previewTabs = [
  {
    id: "packages",
    label: "packages",
    icon: PackageCheck,
    title: "Package graph",
    summary: "Versioned knowledge and runtime units with explicit dependencies.",
    lines: [
      "nenjo/agents/nenji@0.1.0",
      "  depends_on:",
      "    knowledge/core@^0.1.0",
      "    abilities/design_agent@^0.1.0",
      "    abilities/design_workflow@^0.1.0",
    ],
  },
  {
    id: "knowledge",
    label: "knowledge graph",
    icon: Network,
    title: "Knowledge graph",
    summary: "Documents become connected concepts agents can traverse.",
    lines: [
      "domain documents",
      "policy documents",
      "taxonomy documents",
      "template variables",
    ],
  },
  {
    id: "manifest",
    label: "agent manifest",
    icon: Braces,
    title: "Manifest as code",
    summary: "Agent behavior lives in portable, reviewable package files.",
    lines: [
      "schema: nenjo.agent.v1",
      "name: Nenji",
      "entry: agent.yaml",
      "scopes:",
      "  - agents:read",
      "  - routines:read",
      "  - abilities:read",
    ],
  },
  {
    id: "routine",
    label: "routine flow",
    icon: GitBranch,
    title: "Routine flow",
    summary: "DAG orchestration for long-running work, review loops, and retries.",
    lines: [
      "task",
      "  -> implementation",
      "  -> verification review",
      "     pass -> done",
      "     fail -> implementation",
    ],
  },
];

const navSections = [
  { id: "hero", label: "Overview" },
  { id: "zero-trust", label: "Zero-trust" },
  { id: "packages", label: "Native packages" },
  { id: "control-plane", label: "Nenjo Cloud" },
  { id: "architecture", label: "Architecture" },
  { id: "teams", label: "For teams" },
  { id: "how", label: "How it works" },
  { id: "builders", label: "Builders" },
];

export default function LandingPage() {
  const [activePreview, setActivePreview] = useState(previewTabs[0]);
  const [currentSection, setCurrentSection] = useState(navSections[0].label);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const anchor = window.scrollY + window.innerHeight * 0.35;
      const active = navSections.reduce((current, section) => {
        const element = document.getElementById(section.id);
        if (!element) return current;
        return element.offsetTop <= anchor ? section : current;
      }, navSections[0]);
      setCurrentSection(active.label);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <main className="nenjo-landing nenjo-light">
      <nav className="lp-nav" aria-label="Primary">
        <Link className="lp-brand" href="/" aria-label="Nenjo home">
          <img src={NAV_LOGO} alt="Nenjo" width="31" height="28" />
          <span>Nenjo</span>
        </Link>
        <div className="lp-nav-current" aria-live="polite">{currentSection}</div>
        <div className="lp-nav-actions">
          <Link className="lp-nav-ghost" href="/pricing">
            <BadgeDollarSign size={16} />
            Pricing
          </Link>
          <Link className="lp-nav-ghost" href="/docs">
            <BookOpen size={16} />
            Docs
          </Link>
          <a className="lp-nav-ghost" href="https://github.com/nenjo-ai/nenjo" target="_blank" rel="noreferrer">
            <Github size={16} />
            GitHub
          </a>
          <Link className="lp-nav-cta" href="/dashboard/login">
            <LayoutDashboard size={16} />
            Sign in
          </Link>
          <button
            className="lp-nav-burger"
            type="button"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
        {menuOpen && (
          <div className="lp-nav-menu">
            <Link href="/pricing" onClick={() => setMenuOpen(false)}>
              <BadgeDollarSign size={16} />
              Pricing
            </Link>
            <Link href="/docs" onClick={() => setMenuOpen(false)}>
              <BookOpen size={16} />
              Docs
            </Link>
            <a
              href="https://github.com/nenjo-ai/nenjo"
              target="_blank"
              rel="noreferrer"
              onClick={() => setMenuOpen(false)}
            >
              <Github size={16} />
              GitHub
            </a>
            <Link href="/dashboard/login" onClick={() => setMenuOpen(false)}>
              <LayoutDashboard size={16} />
              Sign in
            </Link>
          </div>
        )}
      </nav>

      <section className="lp-hero" id="hero">
        <div className="lp-hero-copy">
          <div className="lp-kicker">
            <span>Zero-trust</span>
            <span>Collaborative</span>
            <span>Open source</span>
          </div>
          <h1>The private, collaborative agentic workspace.</h1>
          <p className="lp-hero-lede">
            Build and run teams of agents on a fully managed platform — with everything encrypted on your devices first, so not even Nenjo can read it.
          </p>
          <p className="lp-hero-note">
            Workers run on your infrastructure. Nenjo Cloud coordinates them — required today.
          </p>
          <div className="lp-actions">
            <Link className="lp-button primary" href="/dashboard/login">
              <LayoutDashboard size={18} />
              Start free
            </Link>
            <Link className="lp-button secondary" href="/docs">
              <Play size={18} />
              Read the docs
            </Link>
            <Link className="lp-button secondary" href="/pricing">
              See pricing
            </Link>
            <a className="lp-link" href="https://github.com/nenjo-ai/nenjo" target="_blank" rel="noreferrer">
              <Github size={16} />
              View on GitHub
            </a>
          </div>
          <div className="lp-hero-points">
            <span>Managed dashboard</span>
            <span>Encrypted client-side</span>
            <span>Runs on your workers</span>
          </div>
        </div>

        <div className="lp-hero-panel" aria-label="Nenjo package runtime preview">
          <div className="lp-panel-top">
            <div>
              <span className="lp-panel-label">runtime</span>
              <strong>nenjo worker</strong>
            </div>
            <span className="lp-live"><span />live</span>
          </div>
          <div className="lp-terminal">
            <div className="lp-preview-panel" data-preview={activePreview.id}>
              <div className="lp-preview-visual">
                <div className="lp-preview-copy">
                  <span>{activePreview.label}</span>
                  <strong>{activePreview.title}</strong>
                  <p>{activePreview.summary}</p>
                </div>
                <div className="lp-preview-orbit" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
              <div className="lp-preview-code">
                {activePreview.lines.map((line) => (
                  <code key={line}>{line}</code>
                ))}
              </div>
            </div>
          </div>
          <div className="lp-package-map">
            {previewTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  className={`lp-map-node${activePreview.id === tab.id ? " active" : ""}`}
                  key={tab.id}
                  type="button"
                  onClick={() => setActivePreview(tab)}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="lp-control-plane" id="zero-trust">
        <div className="lp-control-copy">
          <span className="lp-eyebrow">Zero-trust by architecture</span>
          <h2>The convenience of a hosted platform, without the data trust it usually demands.</h2>
          <p>
            Nenjo runs a hosted dashboard and backend, so you get the polish of a managed product. But every chat message and dashboard-authored resource — agent prompts, knowledge documents, agent responses — is encrypted on your devices first. The platform only ever stores and routes ciphertext it cannot read, so &ldquo;managed&rdquo; never means &ldquo;hand it over.&rdquo;
          </p>
        </div>
        <div className="lp-split-grid">
          <article>
            <Lock size={22} />
            <h3>Encrypted client-side</h3>
            <p>Material that may hold sensitive business or personal context is unreadable to Nenjo by design. Everything in between simply stores and routes encrypted data for your convenience.</p>
          </article>
          <article>
            <EyeOff size={22} />
            <h3>You own the trust boundary</h3>
            <p>Your devices and your own Nenjo workers are the only places your content exists in the clear. Nothing in between, including the platform, can read it.</p>
            <Link href="/docs/platform/security">How the security model works</Link>
          </article>
        </div>
      </section>

      <section className="lp-section" id="packages">
        <div className="lp-section-head">
          <span className="lp-eyebrow">How agents ship and evolve</span>
          <h2>Versioned packages, updated live on workers you control.</h2>
          <p>
            Nenjo gives agentic systems a real package manager: first-class, versioned packages for structured knowledge and runtime configuration that move cleanly between projects, environments, and machines you own.
          </p>
        </div>
        <div className="lp-card-grid">
          {packages.map((item) => {
            const Icon = item.icon;
            return (
              <article className="lp-card" key={item.title}>
                <Icon size={22} />
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="lp-control-plane" id="control-plane">
        <div className="lp-control-copy">
          <span className="lp-eyebrow">Open source plus hosted control</span>
          <h2>Use the runtime in your code. Operate it from Nenjo Cloud.</h2>
          <p>
            Nenjo’s modular runtime and package primitives are open source. Nenjo Cloud adds the managed dashboard for onboarding, package operations, observability, and live updates when convenience and team workflow matter.
          </p>
        </div>
        <div className="lp-split-grid">
          <article>
            <Github size={22} />
            <h3>Open-source Nenjo</h3>
            <p>Core Rust crates, worker runtime, package primitives, manifests, and SDK paths you can inspect, extend, and embed in your own systems.</p>
            <a href="https://github.com/nenjo-ai/nenjo" target="_blank" rel="noreferrer">View the code</a>
          </article>
          <article>
            <LayoutDashboard size={22} />
            <h3>Hosted control plane</h3>
            <p>Nenjo Cloud is the managed product dashboard for onboarding, managing packages, coordinating workers, and evolving live systems from one shared control surface.</p>
            <Link href="/dashboard/login">Enter dashboard</Link>
          </article>
        </div>
      </section>

      <section className="lp-band" id="architecture">
        <div className="lp-band-copy">
          <span className="lp-eyebrow">Hybrid architecture</span>
          <h2>Built on Rust. Designed for your infrastructure.</h2>
          <p>
            Embed Nenjo core crates inside your product, run standalone workers with <code>nenjo run</code>, or combine both. The hosted control plane coordinates package operations while zero-trust boundaries and encrypted context keep runtime control close to your apps and infrastructure.{" "}
            <Link href="/docs/harness">Explore the harness →</Link>
          </p>
        </div>
        <div className="lp-primitive-grid">
          {primitives.map((item) => (
            <div className="lp-primitive" key={item}>
              <ShieldCheck size={16} />
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-layer-grid">
          {layers.map((layer) => (
            <article className="lp-layer" key={layer.label}>
              <div className="lp-layer-icon">
                {layer.label === "Knowledge Layer" ? <Network size={24} /> : <Layers3 size={24} />}
              </div>
              <span className="lp-eyebrow">{layer.label}</span>
              <h2>{layer.title}</h2>
              <p>{layer.body}</p>
              <ul>
                {layer.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-band" id="teams">
        <div className="lp-band-copy">
          <span className="lp-eyebrow">Built for teams</span>
          <h2>Design, operate, and control your agents together.</h2>
          <p>
            Create a workspace, invite your teammates, and build agentic workflows together — with shared knowledge, clear roles, and explicit permission boundaries instead of scattered chat histories and one-off prompts.
          </p>
        </div>
        <div className="lp-primitive-grid">
          <div className="lp-primitive">
            <Users size={16} />
            Shared workspaces
          </div>
          <div className="lp-primitive">
            <Users size={16} />
            Shared knowledge
          </div>
          <div className="lp-primitive">
            <Users size={16} />
            Clear roles
          </div>
          <div className="lp-primitive">
            <Users size={16} />
            Permission boundaries
          </div>
        </div>
      </section>

      <section className="lp-how" id="how">
        <div className="lp-section-head">
          <span className="lp-eyebrow">How it works</span>
          <h2>Three steps to a live agentic system.</h2>
        </div>
        <div className="lp-steps">
          <div>
            <span>01</span>
            <h3>Run your workers</h3>
            <p>
              Deploy <code>nenjo run</code> where your data, tools, and policies already live.{" "}
              <Link href="/docs/introduction/installation">Install the harness →</Link>
            </p>
          </div>
          <div>
            <span>02</span>
            <h3>Chat with Nenji</h3>
            <p>
              Nenji is included in the first Nenjo package to help you rapidly bootstrap agents, routines, abilities, and context from a conversation.{" "}
              <Link href="/docs/getting-started/onboarding">Onboarding guide →</Link>
            </p>
          </div>
          <div>
            <span>03</span>
            <h3>Evolve without downtime</h3>
            <p>Update packages or manifests live while running agents and routines continue uninterrupted.</p>
          </div>
        </div>
      </section>

      <section className="lp-section" id="builders">
        <div className="lp-section-head">
          <span className="lp-eyebrow">Built for every builder</span>
          <h2>One control plane. Multiple ways to ship.</h2>
        </div>
        <div className="lp-builder-grid">
          {builders.map((builder) => (
            <article className="lp-builder" key={builder.title}>
              <Boxes size={20} />
              <h3>{builder.title}</h3>
              <p>{builder.body}</p>
              <Link className="lp-builder-link" href={builder.href}>
                {builder.linkLabel} →
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-cta">
        <GitBranch size={28} />
        <h2>Package once. Deploy anywhere. Keep control.</h2>
        <p>
          Start with the open-source runtime, explore the docs, or enter the hosted dashboard to onboard and manage your live agent systems.
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
          <a className="lp-button secondary" href="https://github.com/nenjo-ai/nenjo" target="_blank" rel="noreferrer">
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
          <Link href="/docs">Docs</Link>
          <Link href="/pricing">Pricing</Link>
          <a href="https://github.com/nenjo-ai/nenjo" target="_blank" rel="noreferrer">
            GitHub
          </a>
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
