"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pingWorker } from "@/lib/api";
import { useWorkerStatus } from "@/lib/hooks";

const PING_TIMEOUT_MS = 4000;
const POLL_INTERVAL_MS = 30_000;

/**
 * Displays harness connection status with a colored dot.
 *
 * Uses the worker status REST endpoint for passive polling and the ping
 * endpoint for active checks.
 */
export function WorkerStatusIndicator() {
  const { isConnected, mutate } = useWorkerStatus();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const manualRef = useRef(false);

  useEffect(() => {
    setConnected(isConnected);
  }, [isConnected]);

  const ping = useCallback(async (manual = false) => {
    manualRef.current = manual;
    if (manual) setChecking(true);

    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setChecking(false);
      manualRef.current = false;
      setConnected(false);
    }, PING_TIMEOUT_MS);

    try {
      const result = await pingWorker();
      clearTimeout(timeoutRef.current);
      setConnected(result.worker_connected);
      await mutate({ worker_connected: result.worker_connected }, false);
    } catch {
      clearTimeout(timeoutRef.current);
      setConnected(false);
    } finally {
      setChecking(false);
      manualRef.current = false;
    }
  }, [mutate]);

  useEffect(() => {
    pollRef.current = setInterval(() => ping(), POLL_INTERVAL_MS);
    return () => {
      clearInterval(pollRef.current);
      clearTimeout(timeoutRef.current);
    };
  }, [ping]);

  // Only show "Checking..." for manual pings
  const busy = checking && manualRef.current;
  const showConnected = connected === true;
  const label = busy ? "Checking…" : showConnected ? "Harness" : connected === null ? "Harness" : "Harness offline";
  const tooltip = busy
    ? "Checking harness connection…"
    : showConnected
      ? "Harness is connected. Click to recheck."
      : "Harness is offline. Click to retry.";

  const dotColor = busy
    ? "bg-gray-400"
    : showConnected
      ? "bg-green-500"
      : connected === null
        ? "bg-gray-400"
        : "bg-red-500";

  const textColor = busy
    ? "text-gray-400 dark:text-gray-500"
    : showConnected
      ? "text-green-600 dark:text-green-400"
      : connected === null
        ? "text-gray-400 dark:text-gray-500"
        : "text-red-600 dark:text-red-400";

  return (
    <div className="group relative">
      <button
        onClick={() => ping(true)}
        className="flex items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
      >
        <span className="relative flex h-2.5 w-2.5">
          {(busy || showConnected) && (
            <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${dotColor} opacity-75`} />
          )}
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dotColor}`} />
        </span>
        <span className={`text-xs font-medium ${textColor}`}>
          {label}
        </span>
      </button>
      <div className="pointer-events-none absolute right-0 top-full mt-1.5 z-50 w-max max-w-48 rounded-lg bg-gray-900 px-3 py-1.5 text-xs text-gray-100 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 dark:bg-gray-700">
        {tooltip}
      </div>
    </div>
  );
}
