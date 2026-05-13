"use client";

import { cn } from "@/lib/cn";
import { useState, useRef, useCallback, useEffect } from "react";


interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  disabled?: boolean;
  error?: string;
  preserveValue?: boolean;
}

/** Normalize a tag: lowercase, trim, replace spaces with hyphens. */
function normalizeTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-");
}

/** Validate a tag string: lowercase, no spaces, alphanumeric + hyphens. */
function isValidTag(tag: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(tag);
}

export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = "Add a tag...",
  disabled = false,
  error,
  preserveValue = false,
}: TagInputProps) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filtered suggestions: not already selected, matching input prefix
  const filtered = suggestions.filter(
    (s) =>
      !value.includes(s) &&
      (input === "" || s.toLowerCase().includes(input.toLowerCase())),
  );

  const addTag = useCallback(
    (raw: string) => {
      const tag = preserveValue ? raw.trim() : normalizeTag(raw);
      if (!tag || (!preserveValue && !isValidTag(tag))) return;
      if (value.includes(tag)) return;
      onChange([...value, tag]);
      setInput("");
      setHighlightIdx(-1);
    },
    [preserveValue, value, onChange],
  );

  const removeTag = useCallback(
    (tag: string) => {
      onChange(value.filter((t) => t !== tag));
    },
    [value, onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === "," || e.key === "Tab") {
      e.preventDefault();
      if (highlightIdx >= 0 && highlightIdx < filtered.length) {
        addTag(filtered[highlightIdx]);
      } else if (input.trim()) {
        addTag(input);
      }
    } else if (e.key === "Backspace" && input === "" && value.length > 0) {
      removeTag(value[value.length - 1]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      setHighlightIdx(-1);
    }
  };

  // Close suggestions on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div
        className={cn(
          "flex flex-wrap gap-1.5 rounded-lg border px-2 py-1.5 transition-colors",
          error
            ? "border-red-300 focus-within:border-red-500 focus-within:ring-1 focus-within:ring-red-500"
            : "border-gray-300 focus-within:border-deep-space-blue-500 focus-within:ring-1 focus-within:ring-deep-space-blue-500",
          disabled && "bg-gray-50 opacity-60 dark:bg-gray-900",
          "dark:border-gray-600",
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {/* Tags */}
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-md bg-deep-space-blue-50 px-2 py-0.5 text-xs font-medium text-deep-space-blue-700 dark:bg-deep-space-blue-900/40 dark:text-deep-space-blue-300"
          >
            {tag}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(tag);
                }}
                className="text-deep-space-blue-400 hover:text-deep-space-blue-700 transition-colors"
                aria-label={`Remove tag ${tag}`}
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </span>
        ))}

        {/* Input */}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowSuggestions(true);
            setHighlightIdx(-1);
          }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ""}
          className="min-w-[80px] flex-1 border-0 bg-transparent text-sm outline-hidden placeholder:text-gray-400 py-0.5 dark:text-gray-100 dark:placeholder:text-gray-500"
          disabled={disabled}
        />
      </div>

      {/* Validation hint */}
      {error ? (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      ) : (
        <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
          Lowercase, no spaces. Press Enter or comma to add.
        </p>
      )}

      {/* Autocomplete dropdown — show on focus when suggestions available */}
      {showSuggestions && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white py-1 shadow-lg max-h-40 overflow-y-auto dark:border-gray-600 dark:bg-gray-800">
          {filtered.slice(0, 10).map((tag, i) => (
            <button
              key={tag}
              type="button"
              className={cn(
                "w-full px-3 py-1.5 text-left text-sm transition-colors",
                i === highlightIdx
                  ? "bg-deep-space-blue-50 text-deep-space-blue-700 dark:bg-deep-space-blue-900/40 dark:text-deep-space-blue-300"
                  : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700",
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                addTag(tag);
              }}
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
