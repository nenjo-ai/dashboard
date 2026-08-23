"use client";

import { Children, isValidElement, memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { MermaidDiagram } from "@/components/ui/MermaidDiagram";

const PROSE_CLASS =
  "prose max-w-none break-normal text-[15px] leading-7 md:break-words md:text-sm md:leading-relaxed dark:prose-invert prose-p:my-2 prose-headings:my-3 prose-headings:font-semibold prose-headings:tracking-[-0.02em] prose-headings:text-gray-950 dark:prose-headings:text-white prose-p:text-gray-800 dark:prose-p:text-gray-200 prose-a:text-deep-space-blue-600 prose-a:break-all dark:prose-a:text-deep-space-blue-400 prose-code:rounded prose-code:bg-black/[0.06] prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[0.85em] prose-code:font-medium prose-code:text-gray-900 prose-code:break-all dark:prose-code:bg-white/[0.08] dark:prose-code:text-gray-100 prose-pre:overflow-x-auto prose-pre:rounded-[1.35rem] prose-pre:border prose-pre:border-white/10 prose-pre:bg-[#0a0d12] prose-pre:px-0 prose-pre:py-0 prose-pre:text-[13px] prose-pre:text-gray-100 dark:prose-pre:bg-[#0a0d12] [&_pre_code]:block [&_pre_code]:bg-transparent [&_pre_code]:p-4 [&_pre_code]:pt-3 [&_pre_code]:rounded-none [&_pre_code]:break-normal prose-li:text-gray-800 dark:prose-li:text-gray-200 prose-li:my-1 prose-ul:my-2 prose-ol:my-2 prose-blockquote:border-deep-space-blue-300 prose-blockquote:text-gray-700 dark:prose-blockquote:border-deep-space-blue-700 dark:prose-blockquote:text-gray-300 prose-table:text-xs prose-table:overflow-x-auto prose-th:bg-gray-100 dark:prose-th:bg-gray-800 prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1 prose-td:border-t prose-td:border-gray-200 dark:prose-td:border-gray-700 prose-hr:border-gray-200 dark:prose-hr:border-gray-700";

function getCodeLanguage(className?: string): string | null {
  return /language-([\w-]+)/i.exec(className ?? "")?.[1] ?? null;
}

function formatCodeLanguageLabel(language: string | null): string | null {
  if (!language) return null;
  return language
    .split(/[-_]/g)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const markdownComponents: Components = {
  pre({ children }) {
    const child =
      Children.count(children) === 1 ? Children.only(children) : null;
    if (
      child &&
      typeof child === "object" &&
      "type" in child &&
      (child as React.ReactElement).type === MermaidDiagram
    ) {
      return <>{children}</>;
    }
    const className = isValidElement<{ className?: string }>(child)
      ? child.props.className
      : undefined;
    const language = formatCodeLanguageLabel(getCodeLanguage(className));
    const rawText = isValidElement<{ children?: React.ReactNode }>(child)
      ? String(child.props.children ?? "").replace(/\n$/, "")
      : String(children ?? "").replace(/\n$/, "");

    return (
      <div className="not-prose overflow-hidden rounded-[1.35rem] border border-slate-900 bg-slate-950 text-slate-50 shadow-[0_10px_30px_rgba(2,6,23,0.16)] dark:border-slate-200 dark:bg-slate-50 dark:text-slate-900">
        {language ? (
          <div className="border-b border-slate-800 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:border-slate-200 dark:text-slate-500">
            {language}
          </div>
        ) : null}
        <pre className="m-0 overflow-x-auto bg-slate-950 p-4 text-left text-slate-50 dark:bg-slate-50 dark:text-slate-900">
          <code className="block whitespace-pre font-mono text-[13px] leading-6 text-slate-50 dark:text-slate-900">
            {rawText}
          </code>
        </pre>
      </div>
    );
  },
  code({ className, children, ...props }) {
    const language = getCodeLanguage(className);
    const code = String(children).replace(/\n$/, "");
    if (language === "mermaid") return <MermaidDiagram chart={code} />;
    if (className) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className="font-mono text-[0.85em]" {...props}>
        {children}
      </code>
    );
  },
};

/** One Markdown renderer is used for both streaming drafts and final answers. */
export const AssistantResponseContent = memo(function AssistantResponseContent({
  content,
  streaming = false,
}: {
  content: string;
  streaming?: boolean;
}) {
  if (!content) return null;
  return (
    <div className={PROSE_CLASS}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
      {streaming ? (
        <>
          <span
            className="ml-0.5 inline-block h-4 w-0.5 translate-y-0.5 rounded-full bg-deep-space-blue-500 motion-safe:animate-pulse motion-reduce:animate-none dark:bg-deep-space-blue-400"
            aria-hidden="true"
          />
          <span className="sr-only" role="status" aria-live="polite">
            Responding
          </span>
        </>
      ) : null}
    </div>
  );
});
