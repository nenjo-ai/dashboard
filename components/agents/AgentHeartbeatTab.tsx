"use client";

import { useEffect, useState } from "react";

import {
  startAgentHeartbeat,
  stopAgentHeartbeat,
  triggerAgentHeartbeat,
  updateAgentHeartbeat,
} from "@/lib/api";
import { useAgentExecutions, useAgentHeartbeat } from "@/lib/hooks";
import { Button } from "@/components/ui/Button";

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
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
  const [interval, setInterval] = useState(initialInterval ?? heartbeat?.interval ?? "");
  const [saving, setSaving] = useState(false);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setInterval(heartbeat?.interval ?? initialInterval ?? "");
  }, [heartbeat?.interval, initialInterval]);

  async function refreshAll() {
    await Promise.all([mutateHeartbeat(), mutateExecutions(), onSaved?.()]);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await updateAgentHeartbeat(agentId, { interval });
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
      if (kind === "start") await startAgentHeartbeat(agentId);
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
      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Heartbeat Schedule</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
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
          <label className="block">
            <span className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
              Interval
            </span>
            <input
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
              placeholder="5m"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-deep-space-blue-400 focus:ring-2 focus:ring-deep-space-blue-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
            />
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Examples: `30s`, `5m`, `1h`
            </p>
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800/70">
              <div className="text-xs uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Status</div>
              <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                {heartbeat?.is_active ? "Active" : "Inactive"}
              </div>
            </div>
            <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800/70">
              <div className="text-xs uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Last Run</div>
              <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                {formatTimestamp(heartbeat?.last_run_at)}
              </div>
            </div>
            <div className="rounded-xl bg-gray-50 p-4 dark:bg-gray-800/70">
              <div className="text-xs uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">Next Run</div>
              <div className="mt-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                {formatTimestamp(heartbeat?.next_run_at)}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button size="sm" isLoading={saving} onClick={handleSave} disabled={!interval.trim()}>
            Save Interval
          </Button>
          {isLoading && <span className="text-xs text-gray-500 dark:text-gray-400">Loading state…</span>}
          {error && <span className="text-xs text-red-500">{error}</span>}
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Recent Runs</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Execution history for heartbeat-triggered runs on this agent.
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
              <tr>
                <th className="pb-3 pr-4">Started</th>
                <th className="pb-3 pr-4">Status</th>
                <th className="pb-3 pr-4">Type</th>
                <th className="pb-3 pr-4">ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {(executions ?? []).map((execution) => (
                <tr key={execution.id}>
                  <td className="py-3 pr-4 text-gray-700 dark:text-gray-300">
                    {formatTimestamp(execution.started_at ?? execution.created_at)}
                  </td>
                  <td className="py-3 pr-4">
                    <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                      {execution.status}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-gray-700 dark:text-gray-300">
                    {(execution.config?.trigger as string | undefined) ?? "execution"}
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-gray-500 dark:text-gray-400">
                    {execution.id}
                  </td>
                </tr>
              ))}
              {!executions?.length && (
                <tr>
                  <td colSpan={4} className="py-6 text-sm text-gray-500 dark:text-gray-400">
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
