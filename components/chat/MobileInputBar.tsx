"use client";

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { motion, AnimatePresence } from "motion/react";
import { Mic, Square } from "lucide-react";
import type { AgentDefinition, Domain } from "@/lib/types";
import { RoleIdenticon } from "@/components/ui/RoleIdenticon";
import { PendingDomainPill } from "@/components/project/PendingDomainPill";
import {
  PendingCommandPill,
  type PendingCommandPillCommand,
} from "./PendingCommandPill";
import { MobileTouchButton } from "./MobileTouchButton";
import { MobileBottomSheet } from "./MobileBottomSheet";
import { ChatProgressIndicator } from "./ChatProgressIndicator";

type VoiceInputState = "idle" | "requesting" | "recording" | "processing";

interface MobileInputBarProps {
  input: string;
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  placeholder: string;
  disabled?: boolean;
  isTyping: boolean;
  hasActiveRunTrace: boolean;
  activeAgent?: AgentDefinition;
  availableAgents: AgentDefinition[];
  availableDomains: Domain[];
  onSelectAgent: (agent: AgentDefinition) => void;
  onSelectDomain: (domain: Domain) => void;
  onCancelPress: () => void;
  onVoiceInputPress?: () => void;
  voiceInputState?: VoiceInputState;
  voiceInputDisabled?: boolean;
  agentColor?: string;
  isDomainPending?: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  inDomain?: boolean;
  onExitDomain?: () => void;
  activeDomainLabel?: string;
  pendingDomain?: Domain | null;
  onClearPendingDomain?: () => void;
  pendingCommand?: PendingCommandPillCommand | null;
  onClearPendingCommand?: () => void;
  attachments?: ReactNode;
  sendDisabled?: boolean;
  hasReadyAttachments?: boolean;
}

export function MobileInputBar({
  input,
  onInputChange,
  onKeyDown,
  onSend,
  placeholder,
  disabled,
  isTyping,
  hasActiveRunTrace,
  activeAgent,
  availableAgents,
  availableDomains,
  onSelectAgent,
  onSelectDomain,
  onCancelPress,
  onVoiceInputPress,
  voiceInputState = "idle",
  voiceInputDisabled,
  agentColor,
  isDomainPending,
  inputRef,
  inDomain,
  onExitDomain,
  activeDomainLabel,
  pendingDomain,
  onClearPendingDomain,
  pendingCommand,
  onClearPendingCommand,
  attachments,
  sendDisabled,
  hasReadyAttachments,
}: MobileInputBarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sheetOpen, setSheetOpen] = useState<"agent" | "domain" | null>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [interruptReady, setInterruptReady] = useState(false);
  const [cancelArmed, setCancelArmed] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(max-width: 767px)").matches
      : false,
  );
  const composerRef = useRef<HTMLDivElement | null>(null);
  const blurResetRafRef = useRef<number | null>(null);
  const blurResetCleanupRef = useRef<(() => void) | null>(null);
  const cancelArmTimerRef = useRef<number | null>(null);
  const currentAgentId = activeAgent?.id;
  const interruptActive = isTyping || hasActiveRunTrace;
  const canSend =
    (input.trim().length > 0 || !!pendingCommand || !!hasReadyAttachments) &&
    !sendDisabled;
  const voiceInputBusy =
    voiceInputState === "requesting" || voiceInputState === "processing";
  const voiceInputTitle =
    voiceInputState === "recording"
      ? "Stop recording"
      : voiceInputState === "requesting"
        ? "Preparing microphone"
        : voiceInputState === "processing"
          ? "Transcribing audio"
          : "Record audio";
  const shouldRenderComposer =
    isMobileViewport &&
    pathname.startsWith("/dashboard/chat") &&
    searchParams.get("channel") !== "notifications" &&
    Boolean(searchParams.get("session"));
  const flushToKeyboard =
    shouldRenderComposer && (keyboardVisible || isInputFocused);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const updateViewport = () => setIsMobileViewport(mediaQuery.matches);

    updateViewport();
    mediaQuery.addEventListener("change", updateViewport);

    return () => mediaQuery.removeEventListener("change", updateViewport);
  }, []);

  const openSheet = useCallback(
    (sheet: "agent" | "domain") => {
      inputRef.current?.blur();
      setSheetOpen(sheet);
    },
    [inputRef],
  );

  const closeSheet = useCallback(() => {
    setSheetOpen(null);
  }, []);

  const handleSendPress = useCallback(() => {
    closeSheet();
    inputRef.current?.blur();
    window.setTimeout(() => {
      onSend();
    }, 0);
  }, [closeSheet, inputRef, onSend]);

  const clearCancelArm = useCallback(() => {
    if (cancelArmTimerRef.current !== null) {
      window.clearTimeout(cancelArmTimerRef.current);
      cancelArmTimerRef.current = null;
    }
    setCancelArmed(false);
  }, []);

  const handleCancelPress = useCallback(() => {
    if (cancelArmed) {
      clearCancelArm();
      onCancelPress();
      return;
    }

    setCancelArmed(true);
    cancelArmTimerRef.current = window.setTimeout(() => {
      cancelArmTimerRef.current = null;
      setCancelArmed(false);
    }, 1500);
  }, [cancelArmed, clearCancelArm, onCancelPress]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const resetPageScroll = () => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    const stopBlurReset = () => {
      if (blurResetRafRef.current !== null) {
        cancelAnimationFrame(blurResetRafRef.current);
        blurResetRafRef.current = null;
      }

      if (blurResetCleanupRef.current) {
        blurResetCleanupRef.current();
        blurResetCleanupRef.current = null;
      }
    };

    const handleBlur = () => {
      setIsInputFocused(false);
      stopBlurReset();

      const viewport = window.visualViewport;
      if (!viewport) {
        resetPageScroll();
        return;
      }

      let settleFrames = 0;
      let lastHeight = viewport.height;
      let lastOffsetTop = viewport.offsetTop;

      const tick = () => {
        resetPageScroll();

        const heightChanged = Math.abs(viewport.height - lastHeight) > 1;
        const offsetChanged = Math.abs(viewport.offsetTop - lastOffsetTop) > 1;

        if (heightChanged || offsetChanged) {
          settleFrames = 0;
          lastHeight = viewport.height;
          lastOffsetTop = viewport.offsetTop;
        } else {
          settleFrames += 1;
        }

        if (settleFrames >= 3) {
          stopBlurReset();
          return;
        }

        blurResetRafRef.current = requestAnimationFrame(tick);
      };

      const handleViewportChange = () => {
        settleFrames = 0;
        lastHeight = viewport.height;
        lastOffsetTop = viewport.offsetTop;
        resetPageScroll();

        if (blurResetRafRef.current === null) {
          blurResetRafRef.current = requestAnimationFrame(tick);
        }
      };

      viewport.addEventListener("resize", handleViewportChange);
      viewport.addEventListener("scroll", handleViewportChange);
      blurResetCleanupRef.current = () => {
        viewport.removeEventListener("resize", handleViewportChange);
        viewport.removeEventListener("scroll", handleViewportChange);
      };

      blurResetRafRef.current = requestAnimationFrame(tick);
    };

    const handleFocus = () => {
      setIsInputFocused(true);
      stopBlurReset();
    };

    input.addEventListener("blur", handleBlur);
    input.addEventListener("focus", handleFocus);

    return () => {
      stopBlurReset();
      input.removeEventListener("blur", handleBlur);
      input.removeEventListener("focus", handleFocus);
    };
  }, [inputRef]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const updateKeyboardVisibility = () => {
      const bottomInset = Math.max(
        window.innerHeight - (viewport.height + viewport.offsetTop),
        0,
      );
      const inputFocused = document.activeElement === inputRef.current;
      setKeyboardVisible(inputFocused || bottomInset > 24);
    };

    updateKeyboardVisibility();
    viewport.addEventListener("resize", updateKeyboardVisibility);
    viewport.addEventListener("scroll", updateKeyboardVisibility);

    return () => {
      viewport.removeEventListener("resize", updateKeyboardVisibility);
      viewport.removeEventListener("scroll", updateKeyboardVisibility);
    };
  }, [inputRef]);

  useEffect(() => {
    const root = document.documentElement;
    if (!shouldRenderComposer) {
      root.style.removeProperty("--mobile-composer-height");
      root.style.removeProperty("--mobile-composer-dock-height");
      return;
    }

    const setComposerHeight = () => {
      const height = composerRef.current?.offsetHeight ?? 108;
      root.style.setProperty("--mobile-composer-height", `${height}px`);
      root.style.setProperty(
        "--mobile-composer-dock-height",
        `${height + 24}px`,
      );
    };

    setComposerHeight();

    const observer =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => setComposerHeight())
        : null;

    if (observer && composerRef.current) {
      observer.observe(composerRef.current);
    }

    return () => {
      observer?.disconnect();
      root.style.removeProperty("--mobile-composer-height");
      root.style.removeProperty("--mobile-composer-dock-height");
    };
  }, [inDomain, pendingCommand, pendingDomain, shouldRenderComposer]);

  useEffect(() => {
    const timer = window.setTimeout(
      () => {
        setInterruptReady(interruptActive);
      },
      interruptActive ? 250 : 0,
    );

    return () => window.clearTimeout(timer);
  }, [interruptActive]);

  useEffect(() => {
    return () => {
      if (cancelArmTimerRef.current !== null) {
        window.clearTimeout(cancelArmTimerRef.current);
      }
    };
  }, []);

  const content = (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex w-full max-w-full items-end overflow-x-hidden px-4"
      style={{
        backgroundColor: "rgba(255,255,255,0.01)",
        height: flushToKeyboard
          ? "calc(var(--mobile-composer-height, 108px) + env(safe-area-inset-bottom, 0px))"
          : "calc(var(--mobile-composer-dock-height, 132px) + env(safe-area-inset-bottom, 0px))",
        paddingBottom: flushToKeyboard
          ? "0px"
          : "max(env(safe-area-inset-bottom, 0px), 0.1rem)",
      }}
    >
      <motion.div
        ref={composerRef}
        initial={false}
        animate={{
          scale: 1,
          y: flushToKeyboard ? 0 : inDomain ? -8 : -2,
        }}
        transition={{
          type: "spring",
          stiffness: 260,
          damping: 24,
          mass: 0.9,
        }}
        className="pointer-events-auto relative box-border mx-auto w-full max-w-full overflow-hidden rounded-[1.45rem] border border-black/[0.09] bg-white/[0.82] shadow-[0_14px_42px_rgba(15,23,42,0.14)] backdrop-blur-2xl transition-[border-color] duration-300 dark:border-white/[0.12] dark:bg-[#070b12]/[0.86] dark:shadow-[0_20px_64px_rgba(0,0,0,0.42)]"
        style={{
          borderColor: inDomain && agentColor ? agentColor : undefined,
          marginBottom: flushToKeyboard ? "0px" : undefined,
        }}
      >
        <motion.div
          initial={false}
          animate={{
            opacity: inDomain ? 1 : 0.45,
            scale: inDomain ? 1.02 : 1,
          }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{
            boxShadow: inDomain
              ? `inset 0 0 0 1px ${agentColor ?? "rgba(255,255,255,0.2)"}`
              : undefined,
          }}
        />
        <div className="pointer-events-none absolute inset-px overflow-hidden rounded-[calc(1.45rem-1px)]">
          <div className="absolute inset-0 bg-white/45 backdrop-blur-[26px] [-webkit-backdrop-filter:blur(26px)] dark:bg-[#05070b]/40" />
        </div>

        {attachments ? (
          <div className="relative z-10 px-3 pt-2">{attachments}</div>
        ) : null}

        {/* Text input */}
        <div className="relative z-10 flex items-end gap-2 px-3 pt-3">
          {pendingDomain && onClearPendingDomain && (
            <PendingDomainPill
              domain={pendingDomain}
              onClear={onClearPendingDomain}
              accentColor={agentColor}
              className="mb-1"
            />
          )}
          {pendingCommand && onClearPendingCommand && (
            <PendingCommandPill
              command={pendingCommand}
              onClear={onClearPendingCommand}
              accentColor={agentColor}
              className="mb-1"
            />
          )}
          <textarea
            ref={inputRef}
            value={input}
            onChange={onInputChange}
            onKeyDown={onKeyDown}
            placeholder={
              isDomainPending
                ? "Activating domain..."
                : pendingDomain
                  ? "Describe what to do..."
                  : pendingCommand
                    ? `Arguments for ${pendingCommand.command}...`
                    : placeholder
            }
            disabled={disabled || isDomainPending}
            rows={1}
            className={cn(
              "min-w-0 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-2 pb-1.5 text-[16px] leading-6 tracking-[-0.01em] text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-0 dark:text-gray-50 dark:placeholder:text-gray-500",
              isDomainPending && "opacity-60",
            )}
            style={{ maxHeight: 120, colorScheme: "light" }}
          />
        </div>

        {isDomainPending && (
          <div className="absolute right-5 top-4 z-10">
            <ChatProgressIndicator phase="connecting" compact />
          </div>
        )}

        <div className="relative z-10 flex items-center justify-between gap-2 px-3 pb-2.5 pt-0.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {inDomain && activeDomainLabel ? (
              <MobileTouchButton
                onPress={() => onExitDomain?.()}
                className="flex h-8 min-w-0 max-w-full items-center gap-1 rounded-full px-2.5 text-xs font-medium active:opacity-70"
                style={
                  agentColor
                    ? { backgroundColor: `${agentColor}20`, color: agentColor }
                    : undefined
                }
              >
                <span className="truncate">{activeDomainLabel}</span>
                <svg
                  className="h-3 w-3 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </MobileTouchButton>
            ) : (
              <>
                {availableDomains.length > 0 && (
                  <MobileTouchButton
                    onPress={() => openSheet("domain")}
                    title="Choose domain"
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full border border-black/5 backdrop-blur-sm dark:border-white/10",
                      sheetOpen === "domain"
                        ? "bg-deep-space-blue-100/90 text-deep-space-blue-600 dark:bg-deep-space-blue-500/20 dark:text-deep-space-blue-300"
                        : "bg-black/[0.04] text-gray-500 active:bg-black/[0.07] dark:bg-white/[0.06] dark:text-gray-400",
                    )}
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5-3.9 19.5m-2.1-19.5-3.9 19.5"
                      />
                    </svg>
                  </MobileTouchButton>
                )}

                {availableAgents.length > 1 && (
                  <MobileTouchButton
                    onPress={() => openSheet("agent")}
                    title="Switch agent"
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full border border-black/5 backdrop-blur-sm dark:border-white/10",
                      sheetOpen === "agent"
                        ? "bg-deep-space-blue-100/90 text-deep-space-blue-600 dark:bg-deep-space-blue-500/20 dark:text-deep-space-blue-300"
                        : "bg-black/[0.04] text-gray-500 active:bg-black/[0.07] dark:bg-white/[0.06] dark:text-gray-400",
                    )}
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m3.75-1.5v1.5m-9 13.5v1.5M12 19.5V21m3.75-1.5v1.5M6 7.5h12A1.5 1.5 0 0119.5 9v6a1.5 1.5 0 01-1.5 1.5H6A1.5 1.5 0 014.5 15V9A1.5 1.5 0 016 7.5z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 12a.75.75 0 100-1.5.75.75 0 000 1.5zm6 0a.75.75 0 100-1.5.75.75 0 000 1.5z"
                      />
                    </svg>
                  </MobileTouchButton>
                )}
              </>
            )}

            {activeAgent && !inDomain && (
              <span className="min-w-0 truncate text-[12px] font-medium text-gray-500 dark:text-gray-400">
                {activeAgent.name}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {interruptActive && interruptReady && (
              <>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={cancelArmed ? "armed" : "idle"}
                    initial={{ opacity: 0, x: 6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -6 }}
                    transition={{ duration: 0.16, ease: "easeOut" }}
                    className="whitespace-nowrap text-[10px] font-medium text-gray-400 dark:text-gray-500"
                  >
                    {cancelArmed
                      ? "Press again to cancel"
                      : "Press twice to cancel"}
                  </motion.span>
                </AnimatePresence>
                <button
                  type="button"
                  onClick={handleCancelPress}
                  title={
                    cancelArmed ? "Confirm stop response" : "Stop response"
                  }
                  aria-label={
                    cancelArmed ? "Confirm stop response" : "Stop response"
                  }
                  className={cn(
                    "relative flex h-9 w-9 items-center justify-center rounded-full transition-colors",
                    cancelArmed
                      ? "bg-flag-red-200 text-flag-red-700 dark:bg-flag-red-800/70 dark:text-flag-red-200"
                      : "bg-flag-red-100 text-flag-red-600 dark:bg-flag-red-900/40 dark:text-flag-red-400",
                  )}
                >
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                </button>
              </>
            )}
            {onVoiceInputPress && (
              <MobileTouchButton
                onPress={onVoiceInputPress}
                disabled={voiceInputDisabled}
                title={voiceInputTitle}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full border border-black/5 transition-colors dark:border-white/10",
                  voiceInputState === "recording"
                    ? "bg-flag-red-100 text-flag-red-600 active:bg-flag-red-200 dark:bg-flag-red-900/40 dark:text-flag-red-300"
                    : "bg-black/[0.04] text-gray-500 active:bg-black/[0.07] dark:bg-white/[0.06] dark:text-gray-400",
                  voiceInputDisabled && "opacity-45",
                )}
              >
                {voiceInputBusy ? (
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
              </MobileTouchButton>
            )}
            <MobileTouchButton
              onPress={handleSendPress}
              disabled={!canSend}
              title="Send message"
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-full border border-black/5 transition-colors dark:border-white/10",
                canSend
                  ? "bg-gray-950 text-white active:bg-gray-800 dark:bg-white dark:text-gray-950"
                  : "bg-black/[0.04] text-gray-400 dark:bg-white/[0.06] dark:text-gray-500",
              )}
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18"
                />
              </svg>
            </MobileTouchButton>
          </div>
        </div>
      </motion.div>

      <MobileBottomSheet
        open={shouldRenderComposer && sheetOpen === "agent"}
        onClose={closeSheet}
        title="Switch Agent"
      >
        <div className="space-y-1">
          {availableAgents.map((agent) => (
            <MobileTouchButton
              key={agent.id}
              onPress={() => {
                closeSheet();
                onSelectAgent(agent);
              }}
              className={cn(
                "flex w-full max-w-full min-w-0 items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors active:bg-gray-100 dark:active:bg-gray-800",
                agent.id === currentAgentId
                  ? "bg-gray-100 dark:bg-gray-800"
                  : "hover:bg-gray-50 dark:hover:bg-gray-800/50",
              )}
            >
              <RoleIdenticon
                roleId={agent.id}
                color={agent.color}
                size={28}
                className="shrink-0"
                name={agent.name}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                  {agent.name}
                </p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                  @{agent.name}
                </p>
              </div>
              {agent.id === currentAgentId && (
                <span className="shrink-0 text-[10px] font-medium text-deep-space-blue-500 dark:text-deep-space-blue-400">
                  Active
                </span>
              )}
            </MobileTouchButton>
          ))}
        </div>
      </MobileBottomSheet>

      <MobileBottomSheet
        open={shouldRenderComposer && sheetOpen === "domain"}
        onClose={closeSheet}
        title="Domain Expansion"
      >
        <div className="space-y-1">
          {availableDomains.map((domain) => (
            <MobileTouchButton
              key={domain.id}
              onPress={() => {
                closeSheet();
                onSelectDomain(domain);
              }}
              className="flex w-full max-w-full min-w-0 items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors active:bg-gray-100 dark:active:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xs font-bold text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                #
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                  {domain.command}
                </p>
                <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {domain.name}
                </p>
              </div>
            </MobileTouchButton>
          ))}
        </div>
      </MobileBottomSheet>
    </div>
  );

  if (!shouldRenderComposer) return null;
  if (typeof document === "undefined") return content;
  return createPortal(content, document.body);
}
