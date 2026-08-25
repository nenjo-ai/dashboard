"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Select } from "@/components/ui/Select";
import { useAgents, useProjects, useTokenUsage } from "@/lib/hooks";
import { formatCompactTokens, formatExactTokens } from "@/lib/formatTokens";
import { buildSevenDayTokenUsageRange } from "@/lib/tokenUsageRange";
import type { TokenUsageSource } from "@/lib/types";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

const SOURCE_OPTIONS: Array<{ value: TokenUsageSource | ""; label: string }> = [
  { value: "", label: "All sources" },
  { value: "chat", label: "Chat" },
  { value: "task", label: "Tasks" },
  { value: "routine", label: "Routines" },
];

type DailyUsagePoint = {
  date: string;
  label: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
};

export function TokenUsagePanel({ compact = false }: { compact?: boolean }) {
  const [showFilters, setShowFilters] = useState(false);
  const [source, setSource] = useState<TokenUsageSource | "">("");
  const [projectId, setProjectId] = useState("");
  const [agentId, setAgentId] = useState("");
  const { projects } = useProjects();
  const { agents } = useAgents();

  const range = useMemo(() => buildSevenDayTokenUsageRange(), []);
  const { usage, isLoading, isError } = useTokenUsage({
    source: source || undefined,
    projectId: projectId || undefined,
    agentId: agentId || undefined,
    from: range.from,
    to: range.to,
    groupBy: "day",
  });

  const data = useMemo<DailyUsagePoint[]>(() => {
    const byDate = new Map(usage?.breakdown.map((entry) => [entry.key, entry]) ?? []);
    return range.days.map((day) => {
      const entry = byDate.get(day.date);
      const input = entry?.input_tokens ?? 0;
      const output = entry?.output_tokens ?? 0;
      return {
        date: day.date,
        label: day.label,
        input_tokens: input,
        output_tokens: output,
        total_tokens: input + output,
      };
    });
  }, [range.days, usage?.breakdown]);

  const sevenDayTotal = data.reduce((sum, day) => sum + day.total_tokens, 0);
  const sevenDayInput = data.reduce((sum, day) => sum + day.input_tokens, 0);
  const sevenDayOutput = data.reduce((sum, day) => sum + day.output_tokens, 0);
  const today = data.find((day) => day.label === "Today") ?? data[data.length - 1];
  const activeFilterCount = [source, projectId, agentId].filter(Boolean).length;

  return (
    <section
      id="token-usage"
      className={cn(
        "theme-border theme-surface rounded-[1.4rem] border p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)] md:p-5",
        compact ? "h-full" : "mt-6",
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="theme-text text-sm font-semibold">
              {compact ? "Usage" : "Token usage"}
            </h2>
            <p className="theme-text-muted mt-1 text-sm">
              {compact
                ? "Token activity over the past 8 days."
                : "Past 7 days plus today, grouped by day"}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className={compact ? undefined : "sm:hidden"}
            onClick={() => setShowFilters((visible) => !visible)}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters{activeFilterCount ? ` · ${activeFilterCount}` : ""}
          </Button>
        </div>

        <div
          className={cn(
            showFilters ? "grid" : "hidden",
            "gap-2 sm:grid-cols-3",
            compact ? "lg:w-[620px]" : "sm:grid lg:w-[620px]",
          )}
        >
          <Select
            value={source}
            onChange={(event) => setSource(event.target.value as TokenUsageSource | "")}
            aria-label="Filter token usage by source"
          >
            {SOURCE_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            aria-label="Filter token usage by project"
          >
            <option value="">All projects</option>
            {projects?.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
          <Select
            value={agentId}
            onChange={(event) => setAgentId(event.target.value)}
            aria-label="Filter token usage by agent"
          >
            <option value="">All agents</option>
            {agents?.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div
        className={cn(
          "mt-5 grid gap-4",
          compact ? "lg:grid-cols-[1fr_190px]" : "lg:grid-cols-[1fr_220px]",
        )}
      >
        <div
          className={cn(
            "min-w-0",
            compact ? "h-[190px] md:h-[220px]" : "h-[230px] md:h-[280px]",
          )}
        >
          {isError ? (
            <div className="theme-border theme-text-muted flex h-full items-center justify-center rounded-lg border text-sm">
              Token usage is unavailable.
            </div>
          ) : isLoading ? (
            <div className="theme-border theme-text-muted flex h-full items-center justify-center gap-2 rounded-lg border text-sm" role="status">
              <span>Loading usage</span>
              <span className="flex gap-0.5" aria-hidden="true">
                {[0, 1, 2].map((dot) => (
                  <span key={dot} className="animate-loading-dot h-1 w-1 rounded-full bg-current" style={{ animationDelay: `${dot * 120}ms` }} />
                ))}
              </span>
            </div>
          ) : (
            <ResponsiveContainer
              width="100%"
              height="100%"
              minWidth={0}
              minHeight={0}
              initialDimension={{
                width: compact ? 640 : 920,
                height: compact ? 220 : 280,
              }}
            >
              <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--app-border-color)" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--app-text-muted)", fontSize: 12 }}
                />
                <YAxis
                  width={48}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--app-text-muted)", fontSize: 12 }}
                  tickFormatter={(value) => formatCompactTokens(Number(value))}
                />
                <Tooltip
                  cursor={{ fill: "var(--app-hover)" }}
                  formatter={(value, name) => [
                    `${formatExactTokens(Number(value))} tokens`,
                    name === "input_tokens" ? "Input" : "Output",
                  ]}
                  labelFormatter={(_, payload) => {
                    const point = payload?.[0]?.payload as DailyUsagePoint | undefined;
                    return point
                      ? `${point.label}: ${formatExactTokens(point.total_tokens)} total`
                      : "";
                  }}
                  contentStyle={{
                    background: "var(--app-surface)",
                    border: "1px solid var(--app-border-color)",
                    borderRadius: 8,
                    color: "var(--app-text)",
                  }}
                />
                <Bar
                  dataKey="input_tokens"
                  stackId="tokens"
                  fill="#2563eb"
                  radius={[0, 0, 4, 4]}
                  maxBarSize={52}
                />
                <Bar
                  dataKey="output_tokens"
                  stackId="tokens"
                  fill="#10b981"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={52}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="theme-surface-muted theme-border grid content-start gap-3 rounded-xl border p-4">
          <div>
            <p className="theme-text-muted text-xs">8-day total</p>
            <p className="theme-text mt-1 text-2xl font-semibold">
              {formatCompactTokens(sevenDayTotal)}
            </p>
          </div>
          <div className="theme-border border-t pt-3">
            <p className="theme-text-muted text-xs">Today</p>
            <p className="theme-text mt-1 text-lg font-semibold">
              {formatCompactTokens(today?.total_tokens ?? 0)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#2563eb]" />
                <p className="theme-text-muted text-xs">Input</p>
              </div>
              <p className="theme-text mt-1 text-sm font-medium">
                {formatExactTokens(sevenDayInput)}
              </p>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm bg-[#10b981]" />
                <p className="theme-text-muted text-xs">Output</p>
              </div>
              <p className="theme-text mt-1 text-sm font-medium">
                {formatExactTokens(sevenDayOutput)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
