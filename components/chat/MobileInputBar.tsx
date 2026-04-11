"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { motion, AnimatePresence } from "motion/react";
import type { AgentDefinition, Domain } from "@/lib/types";
import { RoleIdenticon } from "@/components/ui/RoleIdenticon";
import { MobileTouchButton } from "./MobileTouchButton";
import { MobileBottomSheet } from "./MobileBottomSheet";

interface MobileInputBarProps {
  input: string;
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSend: () => void;
  placeholder: string;
  disabled?: boolean;
  isTyping: boolean;
  hasActiveTools: boolean;
  activeAgent?: AgentDefinition;
  availableAgents: AgentDefinition[];
  availableDomains: Domain[];
  onSelectAgent: (agent: AgentDefinition) => void;
  onSelectDomain: (domain: Domain) => void;
  holdProgress: boolean;
  onCancelHoldStart: () => void;
  onCancelHoldEnd: () => void;
  agentColor?: string;
  isDomainPending?: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  inDomain?: boolean;
  onExitDomain?: () => void;
  activeDomainLabel?: string;
}

export function MobileInputBar({
  input,
  onInputChange,
  onKeyDown,
  onSend,
  placeholder,
  disabled,
  isTyping,
  hasActiveTools,
  activeAgent,
  availableAgents,
  availableDomains,
  onSelectAgent,
  onSelectDomain,
  holdProgress,
  onCancelHoldStart,
  onCancelHoldEnd,
  agentColor,
  isDomainPending,
  inputRef,
  inDomain,
  onExitDomain,
  activeDomainLabel,
}: MobileInputBarProps) {
  const [sheetOpen, setSheetOpen] = useState<"agent" | "domain" | null>(null);
  const blurResetRafRef = useRef<number | null>(null);
  const blurResetCleanupRef = useRef<(() => void) | null>(null);
  const currentAgentId = activeAgent?.id;

  const openSheet = useCallback((sheet: "agent" | "domain") => {
    inputRef.current?.blur();
    setSheetOpen(sheet);
  }, [inputRef]);

  const closeSheet = useCallback(() => {
    setSheetOpen(null);
  }, []);

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

  return (
    <div
      className="relative z-30 w-full max-w-full overflow-x-hidden bg-transparent px-3 pt-2"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.4rem)" }}
    >
      {/* Unified pill container */}
      <div
        className="relative box-border mx-auto w-full max-w-full overflow-hidden rounded-[1.6rem] border-2 border-gray-200 bg-white transition-colors duration-300 dark:border-gray-700 dark:bg-gray-900"
        style={{
          borderColor: inDomain && agentColor ? agentColor : undefined,
        }}
      >
        {/* Text input */}
        <textarea
          ref={inputRef}
          value={input}
          onChange={onInputChange}
          onKeyDown={onKeyDown}
          placeholder={isDomainPending ? "Activating domain..." : placeholder}
          disabled={disabled || isDomainPending}
          rows={1}
          className={cn(
            "w-full resize-none overflow-y-auto border-0 bg-transparent px-4 pt-2.5 pb-1.5 text-base placeholder:text-gray-400 focus:outline-none focus:ring-0 dark:text-gray-100 dark:placeholder:text-gray-500",
            isDomainPending && "opacity-60",
          )}
          style={{ maxHeight: 120 }}
        />

        {isDomainPending && (
          <div className="absolute right-4 top-3.5">
            <svg className="h-4 w-4 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}

        {/* Action row inside the pill */}
        <div className="flex items-center justify-between gap-2 px-2.5 pb-2 pt-0.5">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {inDomain && activeDomainLabel ? (
              <MobileTouchButton
                onPress={() => onExitDomain?.()}
                className="flex h-8 min-w-0 max-w-full items-center gap-1 rounded-full px-2.5 text-xs font-medium active:opacity-70"
                style={agentColor ? { backgroundColor: `${agentColor}20`, color: agentColor } : undefined}
              >
                <span className="truncate">{activeDomainLabel}</span>
                <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </MobileTouchButton>
            ) : (
              <>
                {availableDomains.length > 0 && (
                  <MobileTouchButton
                    onPress={() => openSheet("domain")}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full",
                      sheetOpen === "domain"
                        ? "bg-deep-space-blue-100 text-deep-space-blue-600 dark:bg-deep-space-blue-900/40 dark:text-deep-space-blue-400"
                        : "bg-gray-100 text-gray-500 active:bg-gray-200 dark:bg-gray-800 dark:text-gray-400",
                    )}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5-3.9 19.5m-2.1-19.5-3.9 19.5" />
                    </svg>
                  </MobileTouchButton>
                )}

                {availableAgents.length > 1 && (
                  <MobileTouchButton
                    onPress={() => openSheet("agent")}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-full",
                      sheetOpen === "agent"
                        ? "bg-deep-space-blue-100 text-deep-space-blue-600 dark:bg-deep-space-blue-900/40 dark:text-deep-space-blue-400"
                        : "bg-gray-100 text-gray-500 active:bg-gray-200 dark:bg-gray-800 dark:text-gray-400",
                    )}
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m3.75-1.5v1.5m-9 13.5v1.5M12 19.5V21m3.75-1.5v1.5M6 7.5h12A1.5 1.5 0 0119.5 9v6a1.5 1.5 0 01-1.5 1.5H6A1.5 1.5 0 014.5 15V9A1.5 1.5 0 016 7.5z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12a.75.75 0 100-1.5.75.75 0 000 1.5zm6 0a.75.75 0 100-1.5.75.75 0 000 1.5z" />
                    </svg>
                  </MobileTouchButton>
                )}
              </>
            )}

            {activeAgent && !inDomain && (
              <span className="min-w-0 truncate text-[11px] font-medium text-gray-400 dark:text-gray-500">
                {activeAgent.name}
              </span>
            )}
          </div>

          {(isTyping || hasActiveTools) ? (
            <button
              type="button"
              onTouchStart={onCancelHoldStart}
              onTouchEnd={onCancelHoldEnd}
              onMouseDown={(e) => { e.preventDefault(); onCancelHoldStart(); }}
              onMouseUp={onCancelHoldEnd}
              onMouseLeave={onCancelHoldEnd}
              className="relative flex h-8 w-8 items-center justify-center rounded-full bg-flag-red-100 text-flag-red-600 dark:bg-flag-red-900/40 dark:text-flag-red-400"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              {holdProgress && (
                <svg className="absolute inset-0 -rotate-90" viewBox="0 0 32 32">
                  <circle cx="16" cy="16" r="13" fill="none" className="stroke-flag-red-500 dark:stroke-flag-red-400" strokeWidth="2" strokeDasharray="82" strokeDashoffset="82" strokeLinecap="round" style={{ animation: "hold-arc 1s linear forwards" }} />
                </svg>
              )}
            </button>
          ) : (
            <MobileTouchButton
              onPress={onSend}
              disabled={!input.trim()}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                input.trim()
                  ? "bg-deep-space-blue-500 text-white active:bg-deep-space-blue-600"
                  : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500",
              )}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
              </svg>
            </MobileTouchButton>
          )}
        </div>
      </div>

      <AnimatePresence>
        {(isTyping || hasActiveTools) && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-1 text-center text-[10px] text-gray-400 dark:text-gray-500"
          >
            Hold stop to cancel
          </motion.p>
        )}
      </AnimatePresence>

      <MobileBottomSheet
        open={sheetOpen === "agent"}
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
              <RoleIdenticon roleId={agent.id} color={agent.color} size={28} className="shrink-0" roleName={agent.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                  {agent.display_name || agent.name}
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
        open={sheetOpen === "domain"}
        onClose={closeSheet}
        title="Enter Domain"
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
                  {domain.display_name}
                </p>
              </div>
            </MobileTouchButton>
          ))}
        </div>
      </MobileBottomSheet>
    </div>
  );
}
