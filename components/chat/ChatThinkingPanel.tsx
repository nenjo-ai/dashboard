"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Brain, ChevronDown, ChevronRight } from "lucide-react";
import { fetchChatTraceEvents } from "@/lib/api";
import { decryptContentPayload } from "@/lib/cryptoContent";
import type { ChatMessage, EncryptedPayload } from "@/lib/types";

/**
 * Collapsible thinking transcript for an assistant turn.
 *
 * Live turns carry reasoning captured from stream frames; persisted turns
 * hydrate it lazily from the run's S3 trace archive on first expand. The
 * panel auto-collapses once the answer starts streaming, but a manual
 * override always wins.
 */
export function ChatThinkingPanel({
  message,
  active,
  answerStarted,
}: {
  message: ChatMessage;
  active: boolean;
  answerStarted: boolean;
}) {
  const traceRunId = message.runEnvelopeId;
  const hasSource = Boolean(message.reasoning || traceRunId);
  const [userExpanded, setUserExpanded] = useState<boolean | null>(null);
  const [hydrated, setHydrated] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const requestRunIdRef = useRef<string | null>(null);

  const expanded = userExpanded ?? (active && !answerStarted);

  const hydrate = useCallback(async () => {
    if (!traceRunId || message.reasoning || hydrated !== null) return;
    requestRunIdRef.current = traceRunId;
    setLoading(true);
    try {
      const page = await fetchChatTraceEvents(traceRunId);
      if (requestRunIdRef.current !== traceRunId) return;
      const deltas = await Promise.all(
        page.events
          .filter(
            (event) =>
              event.event?.event_type === "AssistantReasoningDelta" &&
              typeof event.sequence === "number",
          )
          .sort((a, b) => a.sequence - b.sequence)
          .map((event) => reasoningDeltaText(event.event)),
      );
      setHydrated(deltas.join(""));
    } catch {
      setUnavailable(true);
    } finally {
      if (requestRunIdRef.current === traceRunId) setLoading(false);
    }
  }, [traceRunId, message.reasoning, hydrated]);

  useEffect(() => {
    if (expanded && !message.reasoning) void hydrate();
  }, [expanded, message.reasoning, hydrate]);

  if (!hasSource) return null;

  const content = message.reasoning ?? hydrated;
  const body = content?.trim() ? content : null;

  return (
    <div className="rounded-lg border border-gray-200/70 bg-gray-50/60 text-xs dark:border-gray-700/50 dark:bg-white/[0.03]">
      <button
        type="button"
        onClick={() => setUserExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left font-medium text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        aria-expanded={expanded}
      >
        <Brain className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>{loading ? "Loading thinking…" : "Thinking"}</span>
        {expanded ? (
          <ChevronDown className="ml-auto h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <ChevronRight className="ml-auto h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>
      {expanded ? (
        <div className="whitespace-pre-wrap border-t border-gray-200/70 px-2.5 py-2 leading-5 text-gray-500 dark:border-gray-700/50 dark:text-gray-400">
          {body ??
            (loading
              ? ""
              : unavailable
                ? "Thinking transcript is no longer available."
                : "No thinking tokens were recorded for this turn.")}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Extract one reasoning delta from an archived stream event. Encrypted runs
 * store the `{"delta": …}` JSON inside the AEAD payload; plaintext runs keep
 * it as a plain payload object.
 */
async function reasoningDeltaText(
  event: Record<string, unknown>,
): Promise<string> {
  const data = event.data as
    | {
        payload?: unknown;
        encrypted_payload?: unknown;
      }
    | undefined;
  if (!data) return "";
  const payload =
    typeof data.payload === "object" && data.payload !== null
      ? (data.payload as { delta?: unknown })
      : undefined;
  if (typeof payload?.delta === "string") return payload.delta;
  if (data.encrypted_payload) {
    const decrypted = await decryptContentPayload(
      data.encrypted_payload as EncryptedPayload,
    );
    if (!decrypted) return "";
    try {
      const parsed = JSON.parse(decrypted) as { delta?: unknown };
      return typeof parsed.delta === "string" ? parsed.delta : "";
    } catch {
      return "";
    }
  }
  return "";
}
