import type { ReactNode } from "react";
import Link from "next/link";
import {
  Bot,
  Check,
  KeyRound,
  LayoutDashboard,
  Link2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { NenjoLogoMark } from "@/components/layout/NenjoLogoMark";
import { cn } from "@/lib/cn";
import styles from "./OnboardingShell.module.css";

export type OnboardingStep = 1 | 2 | 3 | 4 | 5;

const STEP_DETAILS = [
  {
    label: "Workspace",
    eyebrow: "Foundation",
    title: "Give your workspace a home.",
    description:
      "This is the shared place for your agents, workers, projects, and resources.",
    icon: LayoutDashboard,
  },
  {
    label: "Secure",
    eyebrow: "Private by design",
    title: "Your workspace keys stay with you.",
    description:
      "Nenjo prepares this device, creates a recovery file, and installs the essentials.",
    icon: ShieldCheck,
  },
  {
    label: "Nenji",
    eyebrow: "Your first collaborator",
    title: "Choose how Nenji thinks.",
    description:
      "Connect a model provider and tune the default assistant for the work ahead.",
    icon: Bot,
  },
  {
    label: "API Key",
    eyebrow: "Worker access",
    title: "Create one secure worker key.",
    description:
      "The key links your local runtime to this workspace without exposing your account.",
    icon: KeyRound,
  },
  {
    label: "Connect",
    eyebrow: "Bring it online",
    title: "Make the workspace feel alive.",
    description:
      "Start a worker, approve the connection, and let Nenji welcome you into chat.",
    icon: Link2,
  },
] as const;

function Progress({ currentStep }: { currentStep: OnboardingStep }) {
  const active = STEP_DETAILS[currentStep - 1];

  return (
    <section className="theme-border theme-surface rounded-[1.4rem] border px-4 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)] sm:px-5">
      <div className="sm:hidden">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="theme-text-muted text-[10px] font-semibold uppercase tracking-[0.14em]">
              Step {currentStep} of {STEP_DETAILS.length}
            </p>
            <p className="theme-text mt-1 text-sm font-semibold">{active.label}</p>
          </div>
          <span className="theme-text-muted text-xs">
            {Math.round((currentStep / STEP_DETAILS.length) * 100)}%
          </span>
        </div>
        <div className="theme-surface-muted-strong mt-3 h-1.5 overflow-hidden rounded-full">
          <div
            className="h-full rounded-full bg-deep-space-blue-500 transition-[width] duration-300"
            style={{ width: `${(currentStep / STEP_DETAILS.length) * 100}%` }}
          />
        </div>
      </div>

      <ol aria-label="Onboarding progress" className="hidden grid-cols-5 gap-2 sm:grid">
        {STEP_DETAILS.map((step, index) => {
          const number = (index + 1) as OnboardingStep;
          const complete = number < currentStep;
          const activeStep = number === currentStep;
          const Icon = step.icon;

          return (
            <li
              key={step.label}
              aria-current={activeStep ? "step" : undefined}
              className={cn(
                "relative flex min-w-0 items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors",
                activeStep && "bg-deep-space-blue-50 dark:bg-deep-space-blue-500/10",
              )}
            >
              <span
                className={cn(
                  "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-xs font-semibold",
                  complete && "border-deep-space-blue-500 bg-deep-space-blue-500 text-white",
                  activeStep &&
                    "border-deep-space-blue-200 bg-white text-deep-space-blue-600 shadow-sm dark:border-deep-space-blue-400/30 dark:bg-white/[0.06] dark:text-deep-space-blue-300",
                  !complete && !activeStep &&
                    "theme-border theme-surface-muted theme-text-muted",
                )}
              >
                {complete ? <Check className="h-4 w-4" aria-hidden="true" /> : <Icon className="h-4 w-4" aria-hidden="true" />}
              </span>
              <span className="min-w-0">
                <span className="theme-text-muted block text-[9px] font-semibold uppercase tracking-[0.1em]">
                  {number}
                </span>
                <span
                  className={cn(
                    "block truncate text-[11px] font-semibold lg:text-xs",
                    activeStep ? "text-deep-space-blue-700 dark:text-deep-space-blue-200" : "theme-text",
                  )}
                >
                  {step.label}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function ArtCard({
  currentStep,
  restoreMode,
}: {
  currentStep: OnboardingStep;
  restoreMode: boolean;
}) {
  const detail = restoreMode
    ? {
        eyebrow: "Trusted access",
        title: "Bring this device back into your workspace.",
        description:
          "Approve it from a trusted device or restore access with your recovery file.",
      }
    : STEP_DETAILS[currentStep - 1];

  return (
    <aside
      className={cn(
        styles.artCard,
        "rounded-[1.4rem] border border-white/10 p-5 text-white shadow-[0_18px_48px_rgba(7,9,13,0.24)] sm:p-6 lg:sticky lg:top-24 lg:flex lg:flex-col lg:justify-between",
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/70 backdrop-blur-sm">
          <Sparkles className="h-3 w-3 text-amber-300" aria-hidden="true" />
          {detail.eyebrow}
        </span>
        {!restoreMode ? (
          <span className="font-mono text-[10px] tracking-[0.12em] text-white/35">
            0{currentStep} / 0{STEP_DETAILS.length}
          </span>
        ) : null}
      </div>

      <div className="mt-6 flex items-end justify-between gap-5 lg:mt-12 lg:block">
        <div className="flex gap-2 lg:block lg:space-y-2" aria-hidden="true">
          <span className={cn(styles.kanji, "block text-7xl sm:text-8xl lg:text-9xl")}>念</span>
          <span className={cn(styles.kanji, "block text-7xl sm:text-8xl lg:text-9xl")}>助</span>
        </div>

        <div className="max-w-sm lg:mt-12">
          <div className="mb-4 h-px w-10 bg-amber-300/45" />
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-white sm:text-xl">
            {detail.title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-white/55">{detail.description}</p>
        </div>
      </div>
    </aside>
  );
}

export function OnboardingStepCard({ children }: { children: ReactNode }) {
  return (
    <div className="theme-border theme-surface rounded-[1.4rem] border p-5 shadow-[0_14px_38px_rgba(15,23,42,0.055)] sm:p-6 md:p-7 dark:shadow-[0_18px_45px_rgba(0,0,0,0.18)]">
      {children}
    </div>
  );
}

export function OnboardingShell({
  children,
  currentStep,
  restoreMode = false,
  showProgress = true,
}: {
  children: ReactNode;
  currentStep: OnboardingStep;
  restoreMode?: boolean;
  showProgress?: boolean;
}) {
  return (
    <div className="theme-app-bg theme-text min-h-screen">
      <header className="sticky top-0 z-20 h-16 bg-[var(--app-bg)]/88 backdrop-blur-xl">
        <div className="mx-auto flex h-full w-full max-w-[96rem] items-center justify-between gap-4 px-4 md:px-6 lg:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <NenjoLogoMark className="h-8 w-8 rounded-lg" />
            <span className="min-w-0">
              <span className="theme-text block text-sm font-semibold tracking-[-0.02em]">Nenjo</span>
              <span className="theme-text-muted block truncate text-[10px] font-medium uppercase tracking-[0.12em]">
                Workspace setup
              </span>
            </span>
          </Link>

          <span className="theme-border theme-surface inline-flex h-8 items-center rounded-xl border px-3 text-[11px] font-medium shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
            {restoreMode ? "Secure access" : `Step ${currentStep} of ${STEP_DETAILS.length}`}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[96rem] px-4 pb-8 pt-2 md:px-6 md:pb-10 md:pt-4 lg:px-8">
        {showProgress && !restoreMode ? <Progress currentStep={currentStep} /> : null}

        <div className={cn("grid gap-4 lg:grid-cols-12 lg:gap-5", showProgress && !restoreMode && "mt-4 lg:mt-5")}>
          <section className="order-2 min-w-0 lg:order-1 lg:col-span-8">{children}</section>
          <div className="order-1 min-w-0 lg:order-2 lg:col-span-4">
            <ArtCard currentStep={currentStep} restoreMode={restoreMode} />
          </div>
        </div>
      </main>
    </div>
  );
}
