"use client";

import { Fragment, useEffect, useMemo, useState } from "react";

import {
  decryptHeartbeatInstructionsPayload,
  encryptHeartbeatInstructionsPayload,
  startAgentHeartbeat,
  stopAgentHeartbeat,
  triggerAgentHeartbeat,
  updateAgentHeartbeat,
} from "@/lib/api";
import { useAgentExecutions, useAgentHeartbeat } from "@/lib/hooks";
import { Button } from "@/components/ui/Button";

function browserTimezone(): string {
  if (typeof window === "undefined") return "UTC";
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

function heartbeatFinalOutput(config: Record<string, unknown> | undefined): string | null {
  const output = config?.final_output;
  return typeof output === "string" && output.trim() ? output : null;
}

interface AgentHeartbeatTabProps {
  agentId: string;
  initialInterval?: string | null;
  onSaved?: () => void;
}

export function AgentHeartbeatTab({
  agentId,
  initialInterval,
  onSaved,
}: AgentHeartbeatTabProps) {
  const { heartbeat, mutate: mutateHeartbeat, isLoading } = useAgentHeartbeat(agentId);
  const { executions, mutate: mutateExecutions } = useAgentExecutions(agentId, 15);
  const heartbeatExecutions = useMemo(
    () =>
      (executions ?? []).filter(
        (execution) => execution.config?.trigger === "agent_heartbeat",
      ),
    [executions],
  );
  const [interval, setInterval] = useState(initialInterval ?? heartbeat?.interval ?? "");
  const [timezone, setTimezone] = useState("UTC");
  const [instructions, setInstructions] = useState("");
  const [loadingInstructions, setLoadingInstructions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setInterval(heartbeat?.interval ?? initialInterval ?? "");
  }, [heartbeat?.interval, initialInterval]);

  useEffect(() => {
    const savedTimezone = heartbeat?.metadata?.timezone;
    setTimezone(
      typeof savedTimezone === "string" && savedTimezone.trim()
        ? savedTimezone.trim()
        : browserTimezone(),
    );
  }, [heartbeat?.metadata]);

  useEffect(() => {
    let cancelled = false;
    setLoadingInstructions(true);
    void decryptHeartbeatInstructionsPayload(heartbeat?.encrypted_payload)
      .then((value) => {
        if (!cancelled) setInstructions(value);
      })
      .finally(() => {
        if (!cancelled) setLoadingInstructions(false);
      });

    return () => {
      cancelled = true;
    };
  }, [heartbeat?.encrypted_payload]);

  async function refreshAll() {
    await Promise.all([mutateHeartbeat(), mutateExecutions(), onSaved?.()]);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const encryptedPayload = await encryptHeartbeatInstructionsPayload(
        agentId,
        instructions,
      );
      await updateAgentHeartbeat(agentId, {
        interval,
        metadata: {
          ...(heartbeat?.metadata ?? {}),
          timezone: timezone.trim() || browserTimezone(),
        },
        encrypted_payload: encryptedPayload,
      });
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save heartbeat");
    } finally {
      setSaving(false);
    }
  }

  async function runAction(kind: "start" | "stop" | "trigger") {
    setRunningAction(kind);
    setError(null);
    try {
      if (kind === "start") {
        const encryptedPayload = await encryptHeartbeatInstructionsPayload(
          agentId,
          instructions,
        );
        await updateAgentHeartbeat(agentId, {
          interval,
          metadata: {
            ...(heartbeat?.metadata ?? {}),
            timezone: timezone.trim() || browserTimezone(),
          },
          encrypted_payload: encryptedPayload,
        });
        await startAgentHeartbeat(agentId);
      }
      if (kind === "stop") await stopAgentHeartbeat(agentId);
      if (kind === "trigger") await triggerAgentHeartbeat(agentId);
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${kind} heartbeat`);
    } finally {
      setRunningAction(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="theme-surface theme-border rounded-2xl border p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <h3 className="theme-text text-sm font-semibold">Heartbeat Schedule</h3>
            <p className="theme-text-muted text-sm">
              Run this agent on a fixed interval. Saving updates the stored interval. Starting enables recurring runs.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              isLoading={runningAction === "trigger"}
              onClick={() => runAction("trigger")}
            >
              Trigger Now
            </Button>
            {heartbeat?.is_active ? (
              <Button
                variant="secondary"
                size="sm"
                isLoading={runningAction === "stop"}
                onClick={() => runAction("stop")}
              >
                Stop
              </Button>
            ) : (
              <Button
                size="sm"
                isLoading={runningAction === "start"}
                onClick={() => runAction("start")}
                disabled={!interval.trim()}
              >
                Start
              </Button>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,360px)_1fr]">
          <div className="grid gap-4">
          <label className="block">
            <span className="theme-text-muted mb-2 block text-xs font-medium uppercase tracking-[0.18em]">
              Interval
            </span>
            <input
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
              placeholder="5m"
              className="theme-surface theme-border theme-text w-full rounded-xl border px-3 py-2 text-sm outline-none transition focus:border-deep-space-blue-400 focus:ring-2 focus:ring-deep-space-blue-200"
            />
            <p className="theme-text-muted mt-2 text-xs">
              Examples: `30s`, `5m`, `1h`
            </p>
          </label>
          <label className="block">
            <span className="theme-text-muted mb-2 block text-xs font-medium uppercase tracking-[0.18em]">
              Timezone
            </span>
            <input
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="America/Chicago"
              className="theme-surface theme-border theme-text w-full rounded-xl border px-3 py-2 text-sm outline-none transition focus:border-deep-space-blue-400 focus:ring-2 focus:ring-deep-space-blue-200"
            />
            <p className="theme-text-muted mt-2 text-xs">
              Defaults to your browser timezone. Edit this if VPN or travel changes the browser location.
            </p>
          </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="theme-surface-muted rounded-xl p-4">
              <div className="theme-text-muted text-xs uppercase tracking-[0.18em]">Status</div>
              <div className="theme-text mt-2 text-sm font-semibold">
                {heartbeat?.is_active ? "Active" : "Inactive"}
              </div>
            </div>
            <div className="theme-surface-muted rounded-xl p-4">
              <div className="theme-text-muted text-xs uppercase tracking-[0.18em]">Last Run</div>
              <div className="theme-text mt-2 text-sm font-semibold">
                {formatTimestamp(heartbeat?.last_run_at)}
              </div>
            </div>
            <div className="theme-surface-muted rounded-xl p-4">
              <div className="theme-text-muted text-xs uppercase tracking-[0.18em]">Next Run</div>
              <div className="theme-text mt-2 text-sm font-semibold">
                {formatTimestamp(heartbeat?.next_run_at)}
              </div>
            </div>
          </div>
        </div>

        <label className="mt-4 block">
          <span className="theme-text-muted mb-2 block text-xs font-medium uppercase tracking-[0.18em]">
            Instructions
          </span>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={5}
            placeholder="Optional heartbeat instructions"
            className="theme-surface theme-border theme-text w-full resize-y rounded-xl border px-3 py-2 text-sm outline-none transition focus:border-deep-space-blue-400 focus:ring-2 focus:ring-deep-space-blue-200"
          />
        </label>

        <div className="mt-4 flex items-center gap-3">
          <Button size="sm" isLoading={saving} onClick={handleSave} disabled={!interval.trim()}>
            Save Schedule
          </Button>
          {isLoading && <span className="theme-text-muted text-xs">Loading state…</span>}
          {loadingInstructions && (
            <span className="theme-text-muted text-xs">Loading instructions…</span>
          )}
          {error && <span className="text-xs text-red-500">{error}</span>}
        </div>
      </section>

      <section className="theme-surface theme-border rounded-2xl border p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="theme-text text-sm font-semibold">Recent Runs</h3>
            <p className="theme-text-muted text-sm">
              Execution history for heartbeat-triggered runs on this agent.
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="theme-text-muted text-xs uppercase tracking-[0.18em]">
              <tr>
                <th className="pb-3 pr-4">Started</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Type</th>
                <th className="pb-3 pr-4">ID</th>
              </tr>
            </thead>
            <tbody className="theme-border divide-y">
              {heartbeatExecutions.map((execution) => {
                const finalOutput = heartbeatFinalOutput(execution.config);
                return (
                  <Fragment key={execution.id}>
                    <tr>
                      <td className="theme-text py-3 pr-4">
                        {formatTimestamp(execution.started_at ?? execution.created_at)}
                      </td>
                      <td className="py-3 pr-4">
                        <span className="theme-surface-muted theme-text rounded-full px-2 py-1 text-xs font-medium">
                          {execution.status}
                        </span>
                      </td>
                      <td className="theme-text py-3 pr-4">
                        {(execution.config?.trigger as string | undefined) ?? "execution"}
                      </td>
                      <td className="theme-text-muted py-3 pr-4 font-mono text-xs">
                        {execution.id}
                      </td>
                    </tr>
                    {finalOutput ? (
                      <tr>
                        <td colSpan={4} className="pb-4">
                          <details className="theme-surface-muted rounded-xl px-3 py-2">
                            <summary className="theme-text cursor-pointer text-xs font-medium">
                              Final output
                            </summary>
                            <pre className="theme-text-muted mt-3 max-h-64 overflow-auto whitespace-pre-wrap text-xs leading-relaxed">
                              {finalOutput}
                            </pre>
                          </details>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
              {heartbeatExecutions.length === 0 && (
                <tr>
                  <td colSpan={4} className="theme-text-muted py-6 text-sm">
                    No heartbeat executions yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
