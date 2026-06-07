"use client";

/* eslint-disable @next/next/no-img-element */
import {
  ArrowRight,
  Boxes,
  Braces,
  GitBranch,
  Github,
  Layers3,
  LayoutDashboard,
  Network,
  PackageCheck,
  Play,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const NAV_LOGO = "/nenjo-logo-dark.png";

const packages = [
  {
    icon: Network,
    title: "Knowledge packages",
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
    body: "Hot-swap packages and manifests while workers keep running. Update behavior without restarts, dropped tasks, or vendor-bound dashboards.",
  },
];

const layers = [
  {
    label: "Knowledge Layer",
    title: "Documents become graphs.",
    body: "Knowledge packages organize docs into concepts, relationships, and metadata so agents retrieve context by meaning instead of guessing from flat chunks.",
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
  },
  {
    title: "AI product builders",
    body: "Run standalone workers for long-lived assistants, multi-step routines, and capability-scoped agent systems on your own infrastructure.",
  },
  {
    title: "Consultants and teams",
    body: "Package repeatable client solutions once, adapt per deployment, and keep every install inspectable, self-hosted, and maintainable.",
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
    label: "Routine Flow",
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
  { id: "packages", label: "Native packages" },
  { id: "control-plane", label: "Nenjo Cloud" },
  { id: "architecture", label: "Architecture" },
  { id: "how", label: "How it works" },
  { id: "builders", label: "Builders" },
];

export default function LandingPage() {
  const [activePreview, setActivePreview] = useState(previewTabs[0]);
  const [currentSection, setCurrentSection] = useState(navSections[0].label);

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
          <img src={NAV_LOGO} alt="" width="31" height="28" />
          <span>Nenjo</span>
        </Link>
        <div className="lp-nav-current" aria-live="polite">{currentSection}</div>
        <div className="lp-nav-actions">
          <a className="lp-nav-ghost" href="https://github.com/nenjo-ai/nenjo" target="_blank" rel="noreferrer">
            <Github size={16} />
            Star
          </a>
          <Link className="lp-nav-cta" href="/dashboard/login">
            <LayoutDashboard size={16} />
            Enter
          </Link>
        </div>
      </nav>

      <section className="lp-hero" id="hero">
        <div className="lp-hero-copy">
          <div className="lp-kicker">
            <span>Open source</span>
            <span>Rust-powered</span>
            <span>Native packages</span>
          </div>
          <h1>The modular agentic control plane.</h1>
          <p className="lp-hero-lede">
            Build, deploy, and evolve AI workers across your own apps and infrastructure with versioned packages for knowledge and runtime configuration.
          </p>
          <div className="lp-actions">
            <a className="lp-button primary" href="https://github.com/nenjo-ai/nenjo" target="_blank" rel="noreferrer">
              <Github size={18} />
              Get started on GitHub
            </a>
            <Link className="lp-button secondary" href="/dashboard/login">
              <LayoutDashboard size={18} />
              Enter dashboard
            </Link>
            <Link className="lp-link" href="/docs">
              Read the docs <ArrowRight size={16} />
            </Link>
          </div>
          <div className="lp-hero-points">
            <span>No lock-in</span>
            <span>Hot-swappable updates</span>
            <span>Composable by default</span>
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
            {previewTabs.map((tab) => (
              <button
                className={`lp-map-node${activePreview.id === tab.id ? " active" : ""}`}
                key={tab.id}
                type="button"
                onClick={() => setActivePreview(tab)}
              >
                {tab.id === "packages" && <PackageCheck size={20} />}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section" id="packages">
        <div className="lp-section-head">
          <span className="lp-eyebrow">Native package primitives</span>
          <h2>Skills and configuration, done right.</h2>
          <p>
            Nenjo introduces a real package system for agentic platforms: first-class, versioned packages for structured knowledge and live runtime configuration.
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
            Embed Nenjo core crates inside your product, run standalone workers with <code>nenjo run</code>, or combine both. The hosted control plane coordinates package operations while zero-trust boundaries and encrypted context keep runtime control close to your apps and infrastructure.
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

      <section className="lp-how" id="how">
        <div className="lp-section-head">
          <span className="lp-eyebrow">How it works</span>
          <h2>Three steps to a live agentic system.</h2>
        </div>
        <div className="lp-steps">
          <div>
            <span>01</span>
            <h3>Run your workers</h3>
            <p>Deploy <code>nenjo run</code> where your data, tools, and policies already live.</p>
          </div>
          <div>
            <span>02</span>
            <h3>Chat with Nenji</h3>
            <p>Nenji is included in the first Nenjo package to help you rapidly bootstrap agents, routines, abilities, and context from a conversation.</p>
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
          <a className="lp-button primary" href="https://github.com/nenjo-ai/nenjo" target="_blank" rel="noreferrer">
            <Github size={18} />
            Get started
          </a>
          <Link className="lp-button primary" href="/dashboard/login">
            <LayoutDashboard size={18} />
            Enter dashboard
          </Link>
          <Link className="lp-button secondary" href="/docs">
            <Play size={18} />
            Read the docs
          </Link>
        </div>
      </section>

      <footer className="lp-footer">
        <div>
          <span>Nenjo</span>
          <p>Open source runtime. Managed control plane.</p>
        </div>
        <div className="lp-footer-links">
          <a href="mailto:hello@nenjo.ai">hello@nenjo.ai</a>
          <a href="https://nenjo.ai/privacy">Privacy</a>
          <a href="https://nenjo.ai/cookies">Cookies</a>
          <a href="#" className="termly-display-preferences">
            Cookie Preferences
          </a>
          <a href="https://nenjo.ai/terms">Terms</a>
        </div>
      </footer>
    </main>
  );
}
