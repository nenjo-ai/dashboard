"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { RoutineStepType, CouncilDetail, AgentDefinition, Lambda } from "@/lib/types";
import { fetchAgents, fetchLambdas } from "@/lib/api";

type FlowFnType = "agent" | "lambda" | "council";

// ── Step metadata ────────────────────────────────────────────────────────────

type StepMeta = {
  type: RoutineStepType;
  icon: string;
  name: string;
  color: string;
  desc: string;
};

type Category = {
  label: string;
  subtitle: string;
  steps: StepMeta[];
};

const CATEGORIES: Category[] = [
  {
    label: "Functions",
    subtitle: "Units of work — run standalone or inside flow control",
    steps: [
      { type: "agent",   icon: "✦", name: "Agent",   color: "blue",   desc: "Runs an agent under a role assignment" },
      { type: "lambda",  icon: "λ", name: "Lambda",  color: "orange", desc: "Executes a deterministic script" },
      { type: "council", icon: "⚑", name: "Council", color: "purple", desc: "Multi-agent deliberation" },
    ],
  },
  {
    label: "Flow Control",
    subtitle: "Wrap a function to shape execution — must use a function",
    steps: [
      { type: "cron", icon: "⟳", name: "Cron", color: "cyan",  desc: "Loop a function on an interval" },
      { type: "gate", icon: "⬥", name: "Gate", color: "amber", desc: "Branch on function pass / fail" },
    ],
  },
  {
    label: "Terminal",
    subtitle: "Dedicated stop points for any step",
    steps: [
      { type: "terminal",      icon: "●", name: "End",  color: "emerald", desc: "Routine completed successfully" },
      { type: "terminal_fail", icon: "✕", name: "Fail", color: "red",     desc: "Routine ended in failure" },
    ],
  },
];

const ALL_STEPS = CATEGORIES.flatMap((c) => c.steps);

// ── Tailwind class maps ──────────────────────────────────────────────────────

const ICON_BG: Record<string, string> = {
  blue:    "bg-blue-100   text-blue-600   dark:bg-blue-900/40   dark:text-blue-300",
  orange:  "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300",
  purple:  "bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300",
  cyan:    "bg-cyan-100   text-cyan-600   dark:bg-cyan-900/40   dark:text-cyan-300",
  amber:   "bg-amber-100  text-amber-600  dark:bg-amber-900/40  dark:text-amber-300",
  emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300",
  red:     "bg-red-100    text-red-600    dark:bg-red-900/40    dark:text-red-300",
};

const CARD_SELECTED: Record<string, string> = {
  blue:    "border-blue-400   bg-blue-50   dark:border-blue-500   dark:bg-blue-900/20",
  orange:  "border-orange-400 bg-orange-50 dark:border-orange-500 dark:bg-orange-900/20",
  purple:  "border-purple-400 bg-purple-50 dark:border-purple-500 dark:bg-purple-900/20",
  cyan:    "border-cyan-400   bg-cyan-50   dark:border-cyan-500   dark:bg-cyan-900/20",
  amber:   "border-amber-400  bg-amber-50  dark:border-amber-500  dark:bg-amber-900/20",
  emerald: "border-emerald-400 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-900/20",
  red:     "border-red-400    bg-red-50    dark:border-red-500    dark:bg-red-900/20",
};

const ADD_BTN: Record<string, string> = {
  blue:    "bg-blue-500   hover:bg-blue-600",
  orange:  "bg-orange-500 hover:bg-orange-600",
  purple:  "bg-purple-500 hover:bg-purple-600",
  cyan:    "bg-cyan-500   hover:bg-cyan-600",
  amber:   "bg-amber-500  hover:bg-amber-600",
  emerald: "bg-emerald-500 hover:bg-emerald-600",
  red:     "bg-red-500    hover:bg-red-600",
};

// ── Shared field styles ──────────────────────────────────────────────────────

const SELECT_CLS =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-deep-space-blue-400 focus:outline-hidden focus:ring-1 focus:ring-deep-space-blue-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100";

const LABEL_CLS = "block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1";

const HINT_CLS = "text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed";

// ── Role selector ────────────────────────────────────────────────────────────

function RoleSelector({
  label,
  hint,
  roles,
  loading,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  roles: AgentDefinition[];
  loading: boolean;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className={LABEL_CLS}>{label}</label>
      {loading ? (
        <div className="h-9 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
      ) : (
        <select value={value} onChange={(e) => onChange(e.target.value)} className={SELECT_CLS}>
          <option value="">Select role…</option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      )}
      <p className={HINT_CLS}>{hint}</p>
    </div>
  );
}

// ── Flow control function picker ─────────────────────────────────────────────

function FlowControlConfig({
  hint,
  fnType,
  setFnType,
  roles,
  loadingRoles,
  lambdas,
  loadingLambdas,
  councils,
  selectedRoleId,
  setSelectedRoleId,
  selectedLambdaId,
  setSelectedLambdaId,
  selectedCouncilId,
  setSelectedCouncilId,
}: {
  hint: string;
  fnType: FlowFnType;
  setFnType: (v: FlowFnType) => void;
  roles: AgentDefinition[];
  loadingRoles: boolean;
  lambdas: Lambda[];
  loadingLambdas: boolean;
  councils?: CouncilDetail[];
  selectedRoleId: string;
  setSelectedRoleId: (v: string) => void;
  selectedLambdaId: string;
  setSelectedLambdaId: (v: string) => void;
  selectedCouncilId: string;
  setSelectedCouncilId: (v: string) => void;
}) {
  const tabs: { id: FlowFnType; label: string }[] = [
    { id: "agent", label: "Agent Role" },
    { id: "lambda", label: "Lambda" },
    { id: "council", label: "Council" },
  ];

  return (
    <div className="space-y-3">
      <div>
        <label className={LABEL_CLS}>Function</label>
        <div className="flex overflow-hidden rounded-lg border border-gray-200 text-xs dark:border-gray-700">
          {tabs.map((tab, i) => (
            <button
              key={tab.id}
              onClick={() => setFnType(tab.id)}
              className={`flex-1 py-1.5 transition-colors ${i > 0 ? "border-l border-gray-200 dark:border-gray-700" : ""} ${
                fnType === tab.id
                  ? "bg-gray-100 font-semibold text-gray-900 dark:bg-gray-700 dark:text-gray-100"
                  : "text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {fnType === "agent" &&
        (loadingRoles ? (
          <div className="h-9 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
        ) : (
          <select value={selectedRoleId} onChange={(e) => setSelectedRoleId(e.target.value)} className={SELECT_CLS}>
            <option value="">Select role…</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        ))}

      {fnType === "lambda" &&
        (loadingLambdas ? (
          <div className="h-9 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700" />
        ) : (
          <select value={selectedLambdaId} onChange={(e) => setSelectedLambdaId(e.target.value)} className={SELECT_CLS}>
            <option value="">Select lambda…</option>
            {lambdas.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        ))}

      {fnType === "council" && (
        <select value={selectedCouncilId} onChange={(e) => setSelectedCouncilId(e.target.value)} className={SELECT_CLS}>
          <option value="">Select council…</option>
          {(councils ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}

      <p className={HINT_CLS}>{hint}</p>
    </div>
  );
}

// ── Right panel config ───────────────────────────────────────────────────────

function RightPanelBody({
  selectedType,
  roles,
  loadingRoles,
  lambdas,
  loadingLambdas,
  councils,
  selectedRoleId,
  setSelectedRoleId,
  selectedLambdaId,
  setSelectedLambdaId,
  selectedCouncilId,
  setSelectedCouncilId,
  flowFnType,
  setFlowFnType,
}: {
  selectedType: RoutineStepType;
  roles: AgentDefinition[];
  loadingRoles: boolean;
  lambdas: Lambda[];
  loadingLambdas: boolean;
  councils?: CouncilDetail[];
  selectedRoleId: string;
  setSelectedRoleId: (v: string) => void;
  selectedLambdaId: string;
  setSelectedLambdaId: (v: string) => void;
  selectedCouncilId: string;
  setSelectedCouncilId: (v: string) => void;
  flowFnType: FlowFnType;
  setFlowFnType: (v: FlowFnType) => void;
}) {
  switch (selectedType) {
    case "agent":
      return (
        <RoleSelector
          label="Role"
          hint="The agent assigned to this role will execute the step at runtime."
          roles={roles}
          loading={loadingRoles}
          value={selectedRoleId}
          onChange={setSelectedRoleId}
        />
      );

    case "lambda":
      return (
        <p className={HINT_CLS}>
          A deterministic script step. Select the script and configure its timeout in the step
          panel after adding.
        </p>
      );

    case "council":
      return (
        <div className="space-y-1.5">
          <label className={LABEL_CLS}>Council</label>
          <select
            value={selectedCouncilId}
            onChange={(e) => setSelectedCouncilId(e.target.value)}
            className={SELECT_CLS}
          >
            <option value="">Select council…</option>
            {(councils ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {(!councils || councils.length === 0) && (
            <p className={HINT_CLS}>No councils yet — create one on the Councils page.</p>
          )}
        </div>
      );

    case "cron":
      return (
        <FlowControlConfig
          hint="The selected function runs on each interval tick until it signals completion."
          fnType={flowFnType}
          setFnType={setFlowFnType}
          roles={roles}
          loadingRoles={loadingRoles}
          lambdas={lambdas}
          loadingLambdas={loadingLambdas}
          councils={councils}
          selectedRoleId={selectedRoleId}
          setSelectedRoleId={setSelectedRoleId}
          selectedLambdaId={selectedLambdaId}
          setSelectedLambdaId={setSelectedLambdaId}
          selectedCouncilId={selectedCouncilId}
          setSelectedCouncilId={setSelectedCouncilId}
        />
      );

    case "gate":
      return (
        <FlowControlConfig
          hint="The selected function evaluates the previous step's output and signals pass or fail."
          fnType={flowFnType}
          setFnType={setFlowFnType}
          roles={roles}
          loadingRoles={loadingRoles}
          lambdas={lambdas}
          loadingLambdas={loadingLambdas}
          councils={councils}
          selectedRoleId={selectedRoleId}
          setSelectedRoleId={setSelectedRoleId}
          selectedLambdaId={selectedLambdaId}
          setSelectedLambdaId={setSelectedLambdaId}
          selectedCouncilId={selectedCouncilId}
          setSelectedCouncilId={setSelectedCouncilId}
        />
      );

    case "terminal":
      return (
        <p className={HINT_CLS}>Marks successful routine completion. No configuration needed.</p>
      );

    case "terminal_fail":
      return (
        <p className={HINT_CLS}>
          Marks routine failure. An optional failure reason can be set in the step panel after adding.
        </p>
      );

    default:
      return null;
  }
}

// ── Main component ───────────────────────────────────────────────────────────

interface AddStepModalProps {
  open: boolean;
  councils?: CouncilDetail[];
  onAdd: (stepType: RoutineStepType, roleId?: string, councilId?: string, lambdaId?: string) => void;
  onClose: () => void;
}

export function AddStepModal({ open, councils, onAdd, onClose }: AddStepModalProps) {
  const [selectedType, setSelectedType] = useState<RoutineStepType>("agent");
  const [roles, setRoles] = useState<AgentDefinition[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [lambdas, setLambdas] = useState<Lambda[]>([]);
  const [loadingLambdas, setLoadingLambdas] = useState(true);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [selectedCouncilId, setSelectedCouncilId] = useState("");
  const [selectedLambdaId, setSelectedLambdaId] = useState("");
  const [flowFnType, setFlowFnType] = useState<FlowFnType>("agent");

  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAgents()
      .then(setRoles)
      .catch(console.error)
      .finally(() => setLoadingRoles(false));
    fetchLambdas()
      .then(setLambdas)
      .catch(console.error)
      .finally(() => setLoadingLambdas(false));
  }, []);

  // Clear selections when switching step type
  useEffect(() => {
    setSelectedRoleId("");
    setSelectedCouncilId("");
    setSelectedLambdaId("");
  }, [selectedType]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) onClose();
    },
    [onClose],
  );

  const selectedMeta = ALL_STEPS.find((s) => s.type === selectedType)!;

  const isValid = (() => {
    switch (selectedType) {
      case "agent":
        return selectedRoleId !== "";
      case "council":
        return selectedCouncilId !== "";
      case "cron":
      case "gate":
        if (flowFnType === "agent") return selectedRoleId !== "";
        if (flowFnType === "lambda") return selectedLambdaId !== "";
        if (flowFnType === "council") return selectedCouncilId !== "";
        return false;
      default:
        return true;
    }
  })();

  function handleAdd() {
    if (!isValid) return;
    const roleId = (selectedType === "agent" || (["cron", "gate"].includes(selectedType) && flowFnType === "agent"))
      ? selectedRoleId || undefined
      : undefined;
    const councilId = (selectedType === "council" || (["cron", "gate"].includes(selectedType) && flowFnType === "council"))
      ? selectedCouncilId || undefined
      : undefined;
    const lambdaId = (["cron", "gate"].includes(selectedType) && flowFnType === "lambda")
      ? selectedLambdaId || undefined
      : undefined;
    onAdd(selectedType, roleId, councilId, lambdaId);
  }

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs"
    >
      <div className="flex w-full max-w-2xl overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900">
        {/* Left: step type picker */}
        <div className="w-60 shrink-0 overflow-y-auto border-r border-gray-200 p-4 dark:border-gray-700">
          {CATEGORIES.map((cat) => (
            <div key={cat.label} className="mb-5 last:mb-0">
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                {cat.label}
              </p>
              <p className="mb-2 text-[10px] text-gray-400 dark:text-gray-600">{cat.subtitle}</p>
              <div className="grid grid-cols-2 gap-1.5">
                {cat.steps.map((step) => {
                  const isSelected = selectedType === step.type;
                  return (
                    <button
                      key={step.type}
                      onClick={() => setSelectedType(step.type)}
                      className={`flex flex-col items-center gap-1.5 rounded-lg border p-2.5 text-center transition-all ${
                        isSelected
                          ? CARD_SELECTED[step.color]
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-600 dark:hover:bg-gray-800"
                      }`}
                    >
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-md text-sm font-bold ${ICON_BG[step.color]}`}
                      >
                        {step.icon}
                      </span>
                      <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">
                        {step.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Right: configuration */}
        <div className="flex flex-1 flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3.5 dark:border-gray-700">
            <div className="flex items-center gap-2.5">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-lg text-base font-bold ${ICON_BG[selectedMeta.color]}`}
              >
                {selectedMeta.icon}
              </span>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {selectedMeta.name}
                </p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">{selectedMeta.desc}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Config body */}
          <div className="flex-1 p-5">
            <RightPanelBody
              selectedType={selectedType}
              roles={roles}
              loadingRoles={loadingRoles}
              lambdas={lambdas}
              loadingLambdas={loadingLambdas}
              councils={councils}
              selectedRoleId={selectedRoleId}
              setSelectedRoleId={setSelectedRoleId}
              selectedLambdaId={selectedLambdaId}
              setSelectedLambdaId={setSelectedLambdaId}
              selectedCouncilId={selectedCouncilId}
              setSelectedCouncilId={setSelectedCouncilId}
              flowFnType={flowFnType}
              setFlowFnType={setFlowFnType}
            />
          </div>

          {/* Footer */}
          <div className="border-t border-gray-200 px-5 py-3.5 dark:border-gray-700">
            <button
              onClick={handleAdd}
              disabled={!isValid}
              className={`w-full rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${ADD_BTN[selectedMeta.color]}`}
            >
              Add {selectedMeta.name}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
