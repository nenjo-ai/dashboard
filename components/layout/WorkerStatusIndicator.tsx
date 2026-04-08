"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWebSocketContext } from "@/lib/WebSocketContext";

const PING_TIMEOUT_MS = 4000;
const POLL_INTERVAL_MS = 30_000;

/**
 * Displays harness connection status with a colored dot.
 *
 * Sends `worker.ping` over WebSocket on mount, periodically, and on click.
 * If the worker responds with `worker.pong` within 4 seconds → connected.
 * Otherwise → offline.
 */
export function WorkerStatusIndicator() {
  const { send, subscribe, status: wsStatus } = useWebSocketContext();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const manualRef = useRef(false);

  // Listen for worker.pong responses
  useEffect(() => {
    const unsub = subscribe((data: unknown) => {
      const envelope = data as { type?: string; payload?: { type?: string } };
      const msgType = envelope.payload?.type ?? envelope.type;
      if (msgType === "worker.pong") {
        clearTimeout(timeoutRef.current);
        setChecking(false);
        manualRef.current = false;
        setConnected(true);
      }
    });
    return unsub;
  }, [subscribe]);

  const ping = useCallback((manual = false) => {
    if (wsStatus !== "connected") return;
    manualRef.current = manual;
    if (manual) setChecking(true);
    send({ type: "worker.ping" });

    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setChecking(false);
      manualRef.current = false;
      setConnected(false);
    }, PING_TIMEOUT_MS);
  }, [send, wsStatus]);

  // Auto-ping on WS connect and poll periodically
  useEffect(() => {
    if (wsStatus !== "connected") {
      setConnected(null);
      return;
    }

    // Initial ping once WS handshake completes
    ping();

    pollRef.current = setInterval(() => ping(), POLL_INTERVAL_MS);
    return () => {
      clearInterval(pollRef.current);
      clearTimeout(timeoutRef.current);
    };
  }, [wsStatus, ping]);

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
