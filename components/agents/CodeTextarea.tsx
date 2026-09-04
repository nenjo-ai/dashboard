"use client";

import {
  useRef,
  useCallback,
  useImperativeHandle,
  forwardRef,
  type Ref,
} from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { EditorView, Decoration, type DecorationSet, ViewPlugin, type ViewUpdate, placeholder as cmPlaceholder } from "@codemirror/view";
import { RangeSetBuilder, EditorState } from "@codemirror/state";
import { useTheme } from "@/lib/theme";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CodeTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  onCursorChange?: (line: number, col: number) => void;
  /** Called when user Cmd/Ctrl+clicks a segment inside a {{ context.* }} variable. */
  onContextVarClick?: (segment: string, type: "folder" | "block") => void;
}

export interface CodeTextareaHandle {
  insertAtCursor: (text: string) => void;
}

// ---------------------------------------------------------------------------
// Template variable highlighting extension
// ---------------------------------------------------------------------------

const varMark = Decoration.mark({ class: "cm-template-var" });
const escapedVarMark = Decoration.mark({ class: "cm-template-var-escaped" });
const jinjaTagMark = Decoration.mark({ class: "cm-jinja-tag" });
const jinjaCommentMark = Decoration.mark({ class: "cm-jinja-comment" });
const xmlTagMark = Decoration.mark({ class: "cm-xml-tag" });
const xmlAttrNameMark = Decoration.mark({ class: "cm-xml-attr-name" });
const xmlAttrValueMark = Decoration.mark({ class: "cm-xml-attr-value" });

/** Regex matching `{{ variable }}` tokens (unescaped). */
const VAR_RE = /(?<!\\)\{\{.*?\}\}/g;
/** Regex matching `\{{ variable }}` tokens (escaped). */
const ESCAPED_VAR_RE = /\\(\{\{.*?\}\})/g;
/** Regex matching `{% ... %}` Jinja tags (if, for, endif, etc.). */
const JINJA_TAG_RE = /\{%-?\s*.*?\s*-?%\}/g;
/** Regex matching `{# ... #}` Jinja comments. */
const JINJA_COMMENT_RE = /\{#.*?#\}/g;
/** Regex matching XML tags: `<tag ...>`, `</tag>`, `<tag />`. */
const XML_TAG_RE = /<\/?[a-zA-Z_][\w.-]*(?:\s[^>]*)?\/?>/g;
/** Regex matching attribute name="value" pairs inside a tag body. */
const XML_ATTR_RE = /([a-zA-Z_][\w.-]*)(\s*=\s*)(["'])(.*?)\3/g;

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const text = doc.toString();

  // Collect all matches with their positions, then sort by position
  const matches: { from: number; to: number; mark: Decoration }[] = [];

  // Unescaped variables {{ ... }}
  VAR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = VAR_RE.exec(text)) !== null) {
    matches.push({ from: m.index, to: m.index + m[0].length, mark: varMark });
  }

  // Escaped variables \{{ ... }}
  ESCAPED_VAR_RE.lastIndex = 0;
  while ((m = ESCAPED_VAR_RE.exec(text)) !== null) {
    matches.push({ from: m.index, to: m.index + m[0].length, mark: escapedVarMark });
  }

  // Jinja tags {% ... %}
  JINJA_TAG_RE.lastIndex = 0;
  while ((m = JINJA_TAG_RE.exec(text)) !== null) {
    matches.push({ from: m.index, to: m.index + m[0].length, mark: jinjaTagMark });
  }

  // Jinja comments {# ... #}
  JINJA_COMMENT_RE.lastIndex = 0;
  while ((m = JINJA_COMMENT_RE.exec(text)) !== null) {
    matches.push({ from: m.index, to: m.index + m[0].length, mark: jinjaCommentMark });
  }

  // XML tags — decompose into tag brackets, attr names, attr values
  XML_TAG_RE.lastIndex = 0;
  while ((m = XML_TAG_RE.exec(text)) !== null) {
    const tagStart = m.index;
    const tagStr = m[0];

    // Find the tag name portion: `<tagname` or `</tagname`
    const nameMatch = tagStr.match(/^(<\/?)([\w.-]+)/);
    if (nameMatch) {
      // Opening bracket + tag name
      matches.push({
        from: tagStart,
        to: tagStart + nameMatch[0].length,
        mark: xmlTagMark,
      });
    }

    // Find attributes inside this tag
    const bodyStart = tagStart + (nameMatch ? nameMatch[0].length : 0);
    const bodyStr = tagStr.slice(nameMatch ? nameMatch[0].length : 0);
    XML_ATTR_RE.lastIndex = 0;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = XML_ATTR_RE.exec(bodyStr)) !== null) {
      const attrOffset = bodyStart + attrMatch.index;
      // Attribute name
      matches.push({
        from: attrOffset,
        to: attrOffset + attrMatch[1].length,
        mark: xmlAttrNameMark,
      });
      // Attribute value (including quotes)
      const valueStart = attrOffset + attrMatch[1].length + attrMatch[2].length;
      const valueEnd = valueStart + attrMatch[3].length + attrMatch[4].length + attrMatch[3].length;
      matches.push({
        from: valueStart,
        to: valueEnd,
        mark: xmlAttrValueMark,
      });
    }

    // Closing bracket: `>`, `/>`, or just the end
    const closingMatch = tagStr.match(/(\/?)\s*>$/);
    if (closingMatch) {
      const closingStart = tagStart + tagStr.length - closingMatch[0].length;
      matches.push({
        from: closingStart,
        to: tagStart + tagStr.length,
        mark: xmlTagMark,
      });
    }
  }

  // RangeSetBuilder requires sorted, non-overlapping ranges
  matches.sort((a, b) => a.from - b.from);
  // Remove overlapping ranges (keep first match)
  const filtered: typeof matches = [];
  let lastEnd = 0;
  for (const match of matches) {
    if (match.from >= lastEnd) {
      filtered.push(match);
      lastEnd = match.to;
    }
  }
  for (const { from, to, mark } of filtered) {
    builder.add(from, to, mark);
  }

  return builder.finish();
}

export const templateHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

// ---------------------------------------------------------------------------
// CodeMirror theme (matches existing Tailwind styles)
// ---------------------------------------------------------------------------

export const editorTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      fontSize: "14px",
      backgroundColor: "transparent",
    },
    ".cm-scroller": {
      fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
      lineHeight: "1.5rem",
      overflow: "auto",
      backgroundColor: "transparent",
    },
    ".cm-editor": {
      backgroundColor: "transparent",
    },
    ".cm-content": {
      padding: "12px 0",
      caretColor: "#111827",
      backgroundColor: "transparent",
    },
    ".cm-line": {
      padding: "0 12px",
    },
    ".cm-gutters": {
      backgroundColor: "var(--app-surface-muted)",
      borderRight: "1px solid var(--app-border-color)",
      color: "var(--app-text-muted)",
      minWidth: "48px",
    },
    ".cm-gutterElement": {
      padding: "0 8px 0 0 !important",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "var(--app-text-muted)",
    },
    ".cm-activeLine": {
      backgroundColor: "var(--app-hover)",
    },
    ".cm-selectionBackground": {
      backgroundColor: "rgba(45, 70, 130, 0.25) !important",
    },
    "&.cm-focused .cm-selectionBackground": {
      backgroundColor: "rgba(45, 70, 130, 0.3) !important",
    },
    ".cm-cursor": {
      borderLeftColor: "#111827",
    },
    ".cm-placeholder": {
      color: "var(--app-text-muted)",
      fontStyle: "normal",
    },
    // Template variable highlights
    ".cm-template-var": {
      color: "rgb(29 78 216)",
      fontWeight: "600",
    },
    "&.cm-mod-held .cm-template-var": {
      cursor: "pointer",
      textDecoration: "underline",
    },
    ".cm-template-var-escaped": {
      color: "rgb(156 163 175)",
    },
    // Jinja tag highlights {% if %}, {% for %}, etc.
    ".cm-jinja-tag": {
      color: "rgb(147 51 234)",
      fontWeight: "600",
    },
    // Jinja comment highlights {# ... #}
    ".cm-jinja-comment": {
      color: "rgb(156 163 175)",
      fontStyle: "italic",
    },
    // XML syntax highlights
    ".cm-xml-tag": {
      color: "rgb(153 27 27)",
      fontWeight: "500",
    },
    ".cm-xml-attr-name": {
      color: "rgb(180 83 9)",
    },
    ".cm-xml-attr-value": {
      color: "rgb(21 128 61)",
    },
    // Focus ring
    "&.cm-focused": {
      outline: "none",
    },
  },
  { dark: false },
);

export const editorThemeDark = EditorView.theme(
  {
    "&": {
      height: "100%",
      fontSize: "14px",
      backgroundColor: "transparent",
    },
    ".cm-scroller": {
      fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace",
      lineHeight: "1.5rem",
      overflow: "auto",
      backgroundColor: "transparent",
    },
    ".cm-editor": {
      backgroundColor: "transparent",
    },
    ".cm-content": {
      padding: "12px 0",
      caretColor: "rgb(243 244 246)",
      backgroundColor: "transparent",
    },
    ".cm-line": {
      padding: "0 12px",
    },
    ".cm-gutters": {
      backgroundColor: "var(--app-surface-muted)",
      borderRight: "1px solid var(--app-border-color)",
      color: "var(--app-text-muted)",
      minWidth: "48px",
    },
    ".cm-gutterElement": {
      padding: "0 8px 0 0 !important",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "var(--app-text-muted)",
    },
    ".cm-activeLine": {
      backgroundColor: "var(--app-hover)",
    },
    ".cm-selectionBackground": {
      backgroundColor: "rgba(108, 126, 168, 0.3) !important",
    },
    "&.cm-focused .cm-selectionBackground": {
      backgroundColor: "rgba(108, 126, 168, 0.4) !important",
    },
    ".cm-cursor": {
      borderLeftColor: "rgb(243 244 246)",
    },
    ".cm-placeholder": {
      color: "var(--app-text-muted)",
      fontStyle: "normal",
    },
    // Template variable highlights
    ".cm-template-var": {
      color: "rgb(147 197 253)",
      fontWeight: "600",
    },
    "&.cm-mod-held .cm-template-var": {
      cursor: "pointer",
      textDecoration: "underline",
    },
    ".cm-template-var-escaped": {
      color: "rgb(107 114 128)",
    },
    // Jinja tag highlights {% if %}, {% for %}, etc.
    ".cm-jinja-tag": {
      color: "rgb(192 132 252)",
      fontWeight: "600",
    },
    // Jinja comment highlights {# ... #}
    ".cm-jinja-comment": {
      color: "rgb(107 114 128)",
      fontStyle: "italic",
    },
    // XML syntax highlights
    ".cm-xml-tag": {
      color: "rgb(252 165 165)",
      fontWeight: "500",
    },
    ".cm-xml-attr-name": {
      color: "rgb(253 186 116)",
    },
    ".cm-xml-attr-value": {
      color: "rgb(134 239 172)",
    },
    "&.cm-focused": {
      outline: "none",
    },
  },
  { dark: true },
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/** Build an extension that intercepts Cmd/Ctrl+click on context variable segments. */
function contextVarClickExtension(
  onContextVarClick: (segment: string, type: "folder" | "block") => void,
) {
  const modClass = "cm-mod-held";

  // Use a ViewPlugin to attach window-level key listeners for Cmd/Ctrl
  const modKeyTracker = ViewPlugin.fromClass(
    class {
      private onKeyDown: (e: KeyboardEvent) => void;
      private onKeyUp: (e: KeyboardEvent) => void;
      private onBlur: () => void;
      constructor(private view: EditorView) {
        this.onKeyDown = (e: KeyboardEvent) => {
          if (e.key === "Meta" || e.key === "Control") {
            this.view.dom.classList.add(modClass);
          }
        };
        this.onKeyUp = (e: KeyboardEvent) => {
          if (e.key === "Meta" || e.key === "Control") {
            this.view.dom.classList.remove(modClass);
          }
        };
        this.onBlur = () => this.view.dom.classList.remove(modClass);
        window.addEventListener("keydown", this.onKeyDown);
        window.addEventListener("keyup", this.onKeyUp);
        window.addEventListener("blur", this.onBlur);
      }
      destroy() {
        window.removeEventListener("keydown", this.onKeyDown);
        window.removeEventListener("keyup", this.onKeyUp);
        window.removeEventListener("blur", this.onBlur);
        this.view.dom.classList.remove(modClass);
      }
    },
  );

  return [
    modKeyTracker,
    EditorView.domEventHandlers({
    click(event: MouseEvent, view: EditorView) {
      if (!(event.metaKey || event.ctrlKey)) return false;

      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos === null) return false;

      const text = view.state.doc.toString();
      // Find if click is inside a {{ context.* }} variable
      const CONTEXT_RE = /\{\{\s*context\.([\w.]+)\s*\}\}/g;
      let match: RegExpExecArray | null;
      while ((match = CONTEXT_RE.exec(text)) !== null) {
        const varStart = match.index;
        const varEnd = varStart + match[0].length;
        if (pos >= varStart && pos <= varEnd) {
          // Found the variable — now determine which segment was clicked
          // match[1] is e.g. "nenjo.available_agents"
          const innerStr = match[1];
          const segments = innerStr.split(".");
          // Calculate the offset of "context." prefix within the match
          const prefixLen = match[0].indexOf("context.") + "context.".length;
          const innerOffset = pos - varStart - prefixLen;

          if (innerOffset < 0) return false; // clicked on {{ or context

          // Walk segments to find which one contains the click
          let charPos = 0;
          for (let i = 0; i < segments.length; i++) {
            const segEnd = charPos + segments[i].length;
            if (innerOffset >= charPos && innerOffset <= segEnd) {
              const isLast = i === segments.length - 1;
              onContextVarClick(segments[i], isLast ? "block" : "folder");
              event.preventDefault();
              return true;
            }
            charPos = segEnd + 1; // +1 for the dot
          }
          return false;
        }
      }
      return false;
    },
  }),
  ];
}

export const CodeTextarea = forwardRef(function CodeTextarea(
  { value, onChange, placeholder, readOnly, onCursorChange, onContextVarClick }: CodeTextareaProps,
  ref: Ref<CodeTextareaHandle>,
) {
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const { resolved } = useTheme();
  const isDark = resolved === "dark";

  // Imperative handle for inserting static references at the cursor.
  useImperativeHandle(
    ref,
    () => ({
      insertAtCursor(text: string) {
        const view = cmRef.current?.view;
        if (!view) return;
        const { from, to } = view.state.selection.main;
        view.dispatch({
          changes: { from, to, insert: text },
          selection: { anchor: from + text.length },
        });
        view.focus();
      },
    }),
    [],
  );

  // Cursor change handler
  const handleUpdate = useCallback(
    (update: ViewUpdate) => {
      if (!onCursorChange) return;
      if (update.selectionSet || update.docChanged) {
        const pos = update.state.selection.main.head;
        const line = update.state.doc.lineAt(pos);
        onCursorChange(line.number, pos - line.from + 1);
      }
    },
    [onCursorChange],
  );

  const extensions = [
    templateHighlighter,
    EditorView.lineWrapping,
    ...(placeholder ? [cmPlaceholder(placeholder)] : []),
    ...(onContextVarClick ? contextVarClickExtension(onContextVarClick) : []),
    ...(readOnly ? [EditorView.editable.of(false), EditorState.readOnly.of(true)] : []),
  ];

  return (
    <div className="theme-border theme-surface relative h-full w-full overflow-hidden rounded-lg border">
      <div className="absolute inset-0 [&>div]:h-full [&_.cm-editor]:h-full">
        <CodeMirror
          ref={cmRef}
          value={value}
          onChange={onChange}
          onUpdate={handleUpdate}
          extensions={extensions}
          theme={isDark ? editorThemeDark : editorTheme}
          basicSetup={{
            lineNumbers: true,
            foldGutter: false,
            highlightActiveLine: true,
            highlightActiveLineGutter: true,
            bracketMatching: false,
            closeBrackets: false,
            autocompletion: false,
            highlightSelectionMatches: false,
            searchKeymap: true,
            indentOnInput: false,
          }}
        />
      </div>
    </div>
  );
});
