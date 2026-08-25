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
    <div className="relative">
      {borderPhase && agentColor ? (
        <div
          className="pointer-events-none absolute inset-0 z-10 rounded-2xl"
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
          "overflow-hidden rounded-2xl border bg-white/[0.92] shadow-[0_12px_36px_rgba(15,23,42,0.09)] backdrop-blur-xl transition-[border-color,box-shadow] focus-within:border-deep-space-blue-300 focus-within:shadow-[0_14px_40px_rgba(37,55,105,0.12)] dark:bg-[#0a0e15]/[0.92] dark:shadow-[0_16px_46px_rgba(0,0,0,0.28)]",
          borderPhase
            ? "border-transparent"
            : "border-black/[0.09] dark:border-white/10",
          isDomainPending && "opacity-60",
        )}
      >
        <div className="relative flex min-h-12 items-end gap-2 px-3 pt-3">
          {pendingDomain ? (
            <PendingDomainPill
              domain={pendingDomain}
              onClear={onClearPendingDomain}
              accentColor={agentColor}
              className="mb-1"
            />
          ) : null}
          {pendingCommand ? (
            <PendingCommandPill
              command={pendingCommand}
              onClear={onClearPendingCommand}
              accentColor={agentColor}
              className="mb-1"
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
            className="min-w-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-1 pb-1.5 text-[15px] leading-6 text-gray-900 placeholder:text-gray-400 focus:outline-hidden focus:ring-0 dark:text-gray-100 dark:placeholder:text-gray-500"
            style={{ maxHeight: 200 }}
          />
          {isDomainPending ? (
            <div className="absolute right-4 top-4">
              <ChatProgressIndicator phase="connecting" compact />
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 px-2 pb-2 pt-0.5">
          <div className="flex min-w-0 items-center gap-1">
            <button
              type="button"
              onClick={onVoiceInputPress}
              disabled={voiceInputDisabled}
              title={voiceInputTitle}
              aria-label={voiceInputTitle}
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-black/[0.04] hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.07] dark:hover:text-gray-200",
                voiceInputState === "recording" &&
                  "bg-flag-red-50 text-flag-red-600 hover:bg-flag-red-100 dark:bg-flag-red-950/40 dark:text-flag-red-300",
                voiceInputDisabled &&
                  "cursor-not-allowed opacity-45 hover:bg-transparent dark:hover:bg-transparent",
              )}
            >
              {voiceInputState === "requesting" ||
              voiceInputState === "processing" ? (
                <ChatProgressIndicator
                  phase={
                    voiceInputState === "requesting"
                      ? "connecting"
                      : "finalizing"
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
              className="!h-9 !w-9 !rounded-xl !border-0 !bg-transparent hover:!bg-black/[0.04] dark:hover:!bg-white/[0.07]"
              onAdd={onAddAttachments}
            />
            <AnimatePresence initial={false}>
              {hasActiveTurn ? (
                <motion.span
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -4 }}
                  className="ml-1 truncate text-[10px] font-medium text-gray-400 dark:text-gray-500"
                >
                  Esc twice to stop
                </motion.span>
              ) : null}
            </AnimatePresence>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
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
              className="!h-9 !w-9 !rounded-xl !bg-deep-space-blue-600 !p-0 !text-white shadow-sm hover:!bg-deep-space-blue-500 active:!bg-deep-space-blue-700 disabled:!bg-gray-200 disabled:!text-gray-400 disabled:shadow-none dark:disabled:!bg-white/[0.07] dark:disabled:!text-gray-500"
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
        </div>
      </div>
    </div>
  );
}
