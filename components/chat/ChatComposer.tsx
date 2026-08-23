"use client";

import type { RefObject } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Mic, Square } from "lucide-react";
import { cn } from "@/lib/cn";
import type { Domain } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { ArtifactAttachmentButton } from "@/components/artifacts/ArtifactAttachmentComposer";
import { PendingDomainPill } from "@/components/project/PendingDomainPill";
import { ChatCancelControl } from "./ChatLiveTurnSurface";
import {
  PendingCommandPill,
  type PendingCommandPillCommand,
} from "./PendingCommandPill";
import { ChatProgressIndicator } from "./ChatProgressIndicator";

type VoiceInputState = "idle" | "requesting" | "recording" | "processing";

export function ChatComposer({
  inputRef,
  input,
  onInputChange,
  onKeyDown,
  placeholder,
  pendingDomain,
  pendingCommand,
  onClearPendingDomain,
  onClearPendingCommand,
  isDomainPending,
  borderPhase,
  agentColor,
  voiceInputState,
  voiceInputDisabled,
  voiceInputTitle,
  onVoiceInputPress,
  attachmentCanAdd,
  attachmentDisabled,
  attachmentDisabledReason,
  onAddAttachments,
  canSend,
  onSend,
  hasActiveTurn,
  holdProgress,
  onCancel,
  onCancelHoldStart,
  onCancelHoldEnd,
}: {
  inputRef: RefObject<HTMLTextAreaElement | null>;
  input: string;
  onInputChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder: string;
  pendingDomain: Domain | null;
  pendingCommand: PendingCommandPillCommand | null;
  onClearPendingDomain: () => void;
  onClearPendingCommand: () => void;
  isDomainPending: boolean;
  borderPhase: "enter" | "idle" | "exit" | null;
  agentColor?: string;
  voiceInputState: VoiceInputState;
  voiceInputDisabled: boolean;
  voiceInputTitle: string;
  onVoiceInputPress: () => void;
  attachmentCanAdd: boolean;
  attachmentDisabled: boolean;
  attachmentDisabledReason: string;
  onAddAttachments: (files: FileList) => void;
  canSend: boolean;
  onSend: () => void;
  hasActiveTurn: boolean;
  holdProgress: boolean;
  onCancel: () => void;
  onCancelHoldStart: () => void;
  onCancelHoldEnd: () => void;
}) {
  return (
    <>
      <div className="flex items-end gap-2">
        <div className="relative flex-1">
          {borderPhase && agentColor ? (
            <div
              className="pointer-events-none absolute inset-0 z-10 rounded-lg"
              style={{
                padding: "1px",
                background:
                  borderPhase === "exit"
                    ? `linear-gradient(90deg, transparent 0%, ${agentColor} var(--input-idle-spread, 30%), ${agentColor} calc(var(--input-border-pos, 100%) - var(--input-idle-spread, 30%)), transparent var(--input-border-pos, 100%))`
                    : `linear-gradient(90deg, transparent 0%, ${agentColor} var(--input-idle-spread, 0%), ${agentColor} calc(var(--input-border-pos, 0%) - var(--input-idle-spread, 0%)), transparent var(--input-border-pos, 0%))`,
                mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                maskComposite: "exclude",
                WebkitMask:
                  "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                WebkitMaskComposite: "xor",
                animation:
                  borderPhase === "exit"
                    ? "input-border-exit 2.25s ease-in forwards"
                    : "input-border-enter 2.25s ease-in-out forwards, input-border-idle 6s linear 2.25s infinite",
              }}
            />
          ) : null}
          <div
            className={cn(
              "theme-surface flex min-h-10 w-full items-end gap-2 rounded-lg px-2 py-1.5",
              borderPhase
                ? "border border-transparent"
                : "theme-border border focus-within:border-deep-space-blue-500 focus-within:ring-1 focus-within:ring-deep-space-blue-500",
              isDomainPending && "opacity-60",
            )}
          >
            {pendingDomain ? (
              <PendingDomainPill
                domain={pendingDomain}
                onClear={onClearPendingDomain}
                accentColor={agentColor}
                className="mb-0.5"
              />
            ) : null}
            {pendingCommand ? (
              <PendingCommandPill
                command={pendingCommand}
                onClear={onClearPendingCommand}
                accentColor={agentColor}
                className="mb-0.5"
              />
            ) : null}
            <textarea
              ref={inputRef}
              value={input}
              onChange={onInputChange}
              onKeyDown={onKeyDown}
              placeholder={
                isDomainPending
                  ? "Activating domain..."
                  : pendingDomain
                    ? "Describe what to do in this domain..."
                    : pendingCommand
                      ? `Arguments for ${pendingCommand.command}...`
                      : placeholder
              }
              disabled={isDomainPending}
              rows={1}
              className="min-w-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-1 py-0.5 text-sm placeholder:text-gray-400 focus:outline-hidden focus:ring-0 dark:text-gray-100 dark:placeholder:text-gray-500"
              style={{ maxHeight: 200 }}
            />
          </div>
          {isDomainPending ? (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <ChatProgressIndicator phase="connecting" compact />
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onVoiceInputPress}
          disabled={voiceInputDisabled}
          title={voiceInputTitle}
          aria-label={voiceInputTitle}
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors",
            voiceInputState === "recording"
              ? "border-flag-red-200 bg-flag-red-50 text-flag-red-600 hover:bg-flag-red-100 dark:border-flag-red-900/50 dark:bg-flag-red-950/40 dark:text-flag-red-300"
              : "theme-border theme-surface text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10",
            voiceInputDisabled &&
              "cursor-not-allowed opacity-50 hover:bg-transparent dark:hover:bg-transparent",
          )}
        >
          {voiceInputState === "requesting" ||
          voiceInputState === "processing" ? (
            <ChatProgressIndicator
              phase={
                voiceInputState === "requesting" ? "connecting" : "finalizing"
              }
              compact
            />
          ) : voiceInputState === "recording" ? (
            <Square className="h-3.5 w-3.5 fill-current" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </button>
        <ArtifactAttachmentButton
          canAdd={attachmentCanAdd}
          disabled={attachmentDisabled}
          disabledReason={attachmentDisabledReason}
          iconOnly
          onAdd={onAddAttachments}
        />
        <ChatCancelControl
          visible={hasActiveTurn}
          holdProgress={holdProgress}
          onCancel={onCancel}
          onHoldStart={onCancelHoldStart}
          onHoldEnd={onCancelHoldEnd}
        />
        <Button
          onClick={onSend}
          disabled={!canSend}
          size="md"
          className="!bg-deep-space-blue-500 !text-white hover:!bg-deep-space-blue-400 active:!bg-deep-space-blue-600"
          aria-label="Send message"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
            />
          </svg>
        </Button>
      </div>
      <AnimatePresence>
        {hasActiveTurn ? (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="text-center text-xs text-gray-400 dark:text-gray-500"
          >
            Press{" "}
            <kbd className="theme-border theme-surface-muted rounded border px-1 py-0.5 text-[10px] font-medium">
              Esc
            </kbd>{" "}
            <kbd className="theme-border theme-surface-muted rounded border px-1 py-0.5 text-[10px] font-medium">
              Esc
            </kbd>{" "}
            to interrupt
          </motion.p>
        ) : null}
      </AnimatePresence>
    </>
  );
}
