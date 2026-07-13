"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  type CSSProperties,
} from "react";
import { basicSetup } from "codemirror";
import {
  snippetCompletion,
  type Completion,
  type CompletionSource,
} from "@codemirror/autocomplete";
import { indentLess, indentMore, indentWithTab } from "@codemirror/commands";
import { indentUnit, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { python, pythonLanguage } from "@codemirror/lang-python";
import {
  Annotation,
  Compartment,
  EditorState,
  Transaction,
} from "@codemirror/state";
import { EditorView, keymap, type ViewUpdate } from "@codemirror/view";
import { tags } from "@lezer/highlight";

import type { LineNoteEdit } from "./code-editor";

export interface LeetCodeCodeEditorHandle {
  focus: () => void;
  indent: () => boolean;
  outdent: () => boolean;
  revealLine: (lineNumber: number, options?: { focus?: boolean }) => void;
}

export interface LeetCodeCodeEditorProps {
  value: string;
  onChange: (next: string, lineNoteEdit?: LineNoteEdit) => void;
  onRun: () => void;
  fontSize: number;
  language: "zh" | "en";
  ariaLabel: string;
  onCursorLineChange?: (lineNumber: number) => void;
}

const externalDocumentUpdate = Annotation.define<boolean>();

const editorHighlightStyle = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword], color: "#c586c0" },
  { tag: [tags.name, tags.variableName], color: "#d4d4d4" },
  { tag: [tags.definition(tags.variableName), tags.propertyName], color: "#9cdcfe" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: "#dcdcaa" },
  { tag: [tags.className, tags.typeName, tags.namespace], color: "#4ec9b0" },
  { tag: [tags.string, tags.special(tags.string)], color: "#ce9178" },
  { tag: [tags.number, tags.bool, tags.null], color: "#b5cea8" },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: "#6a9955", fontStyle: "italic" },
  { tag: [tags.operator, tags.punctuation], color: "#d4d4d4" },
  { tag: [tags.bracket, tags.squareBracket, tags.paren, tags.brace], color: "#ffd700" },
  { tag: tags.invalid, color: "#f44747", textDecoration: "underline" },
]);

const darkEditorTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      minHeight: "300px",
      color: "#d4d4d4",
      backgroundColor: "#1e1e1e",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily:
        '"SFMono-Regular", "Cascadia Code", "Roboto Mono", Consolas, "Liberation Mono", monospace',
      lineHeight: "1.65",
    },
    ".cm-content": {
      minHeight: "100%",
      padding: "14px 0 28px",
      caretColor: "#f2a1b9",
    },
    ".cm-line": { padding: "0 18px 0 8px" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#f2a1b9", borderLeftWidth: "2px" },
    ".cm-gutters": {
      color: "#858585",
      backgroundColor: "#1e1e1e",
      border: "none",
      paddingLeft: "8px",
    },
    ".cm-lineNumbers .cm-gutterElement": { minWidth: "2.6em", padding: "0 10px 0 0" },
    ".cm-foldGutter .cm-gutterElement": { color: "#858585" },
    ".cm-activeLine": { backgroundColor: "rgba(255, 255, 255, 0.035)" },
    ".cm-activeLineGutter": { color: "#d4d4d4", backgroundColor: "rgba(255, 255, 255, 0.035)" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
      backgroundColor: "rgba(73, 122, 170, 0.58)",
    },
    ".cm-matchingBracket": {
      color: "inherit",
      backgroundColor: "rgba(255, 161, 22, 0.18)",
      outline: "1px solid rgba(255, 161, 22, 0.55)",
    },
    ".cm-nonmatchingBracket": { color: "#f44747" },
    ".cm-searchMatch": {
      backgroundColor: "rgba(234, 181, 67, 0.32)",
      outline: "1px solid rgba(234, 181, 67, 0.52)",
    },
    ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "rgba(255, 150, 85, 0.5)" },
    ".cm-panels": {
      color: "#d4d4d4",
      backgroundColor: "#252526",
    },
    ".cm-panels.cm-panels-top": { borderBottom: "1px solid #3c3c3c" },
    ".cm-panels.cm-panels-bottom": { borderTop: "1px solid #3c3c3c" },
    ".cm-panel.cm-search": { padding: "7px 10px" },
    ".cm-panel.cm-search input, .cm-panel.cm-search button": {
      color: "#e7e7e7",
      backgroundColor: "#333333",
      border: "1px solid #555555",
      borderRadius: "4px",
    },
    ".cm-panel.cm-search input:focus": { borderColor: "#f2a1b9", outline: "none" },
    ".cm-tooltip": {
      color: "#e8e8e8",
      backgroundColor: "#252526",
      border: "1px solid #454545",
      borderRadius: "6px",
      boxShadow: "0 8px 24px rgba(0, 0, 0, 0.38)",
      overflow: "hidden",
    },
    ".cm-tooltip-autocomplete > ul": {
      maxHeight: "260px",
      fontFamily:
        '"SFMono-Regular", "Cascadia Code", "Roboto Mono", Consolas, "Liberation Mono", monospace',
    },
    ".cm-tooltip-autocomplete > ul > li": { padding: "4px 10px" },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      color: "#ffffff",
      backgroundColor: "#3b3b3b",
      borderLeft: "2px solid #f2a1b9",
    },
    ".cm-completionIcon": { opacity: "0.8" },
    ".cm-completionDetail": { color: "#a9a9a9", fontStyle: "normal" },
    ".cm-placeholder": { color: "#777777", fontStyle: "normal" },
  },
  { dark: true },
);

function normalizedFontSize(fontSize: number): number {
  if (!Number.isFinite(fontSize)) return 15;
  return Math.min(30, Math.max(12, Math.round(fontSize)));
}

function fontSizeTheme(fontSize: number) {
  return EditorView.theme({
    "&": { fontSize: `${normalizedFontSize(fontSize)}px` },
  });
}

function completionOptions(language: "zh" | "en"): Completion[] {
  const detail = language === "zh"
    ? {
        builtin: "Python 内置",
        loop: "循环模板",
        condition: "条件模板",
        function: "函数模板",
        hash: "哈希表模板",
        pointers: "双指针模板",
        binary: "二分查找模板",
        queue: "BFS 队列模板",
        stack: "DFS 栈模板",
        import: "常用导入",
      }
    : {
        builtin: "Python built-in",
        loop: "Loop snippet",
        condition: "Conditional snippet",
        function: "Function snippet",
        hash: "Hash-map snippet",
        pointers: "Two-pointer snippet",
        binary: "Binary-search snippet",
        queue: "BFS queue snippet",
        stack: "DFS stack snippet",
        import: "Common import",
      };

  const builtins = [
    "len",
    "range",
    "enumerate",
    "zip",
    "sorted",
    "sum",
    "min",
    "max",
    "abs",
    "all",
    "any",
    "list",
    "dict",
    "set",
    "tuple",
  ].map<Completion>((label) => ({ label, type: "function", detail: detail.builtin }));

  return [
    ...builtins,
    snippetCompletion("def ${function_name}(${arguments}):\n\t${}", {
      label: "def",
      type: "keyword",
      detail: detail.function,
      boost: 90,
    }),
    snippetCompletion("for ${item} in ${iterable}:\n\t${}", {
      label: "for … in …",
      type: "keyword",
      detail: detail.loop,
      boost: 100,
    }),
    snippetCompletion("for ${index}, ${value} in enumerate(${nums}):\n\t${}", {
      label: "enumerate loop",
      type: "keyword",
      detail: detail.loop,
      boost: 85,
    }),
    snippetCompletion("if ${condition}:\n\t${}", {
      label: "if",
      type: "keyword",
      detail: detail.condition,
      boost: 80,
    }),
    snippetCompletion("seen = {}\nfor index, value in enumerate(${nums}):\n\tneed = ${target} - value\n\tif need in seen:\n\t\treturn [seen[need], index]\n\tseen[value] = index\nreturn []", {
      label: "two-sum hashmap",
      type: "text",
      detail: detail.hash,
      boost: 70,
    }),
    snippetCompletion("left, right = 0, len(${nums}) - 1\nwhile left < right:\n\t${}\n", {
      label: "two pointers",
      type: "text",
      detail: detail.pointers,
      boost: 65,
    }),
    snippetCompletion("left, right = 0, len(${nums}) - 1\nwhile left <= right:\n\tmid = left + (right - left) // 2\n\tif ${nums}[mid] == ${target}:\n\t\treturn mid\n\tif ${nums}[mid] < ${target}:\n\t\tleft = mid + 1\n\telse:\n\t\tright = mid - 1\nreturn -1", {
      label: "binary search",
      type: "text",
      detail: detail.binary,
      boost: 60,
    }),
    snippetCompletion("from collections import deque\n\nqueue = deque([${start}])\nwhile queue:\n\tnode = queue.popleft()\n\t${}", {
      label: "bfs queue",
      type: "text",
      detail: detail.queue,
      boost: 55,
    }),
    snippetCompletion("stack = [${start}]\nwhile stack:\n\tnode = stack.pop()\n\t${}", {
      label: "dfs stack",
      type: "text",
      detail: detail.stack,
      boost: 55,
    }),
    snippetCompletion("from collections import ${deque, defaultdict, Counter}", {
      label: "from collections import",
      type: "keyword",
      detail: detail.import,
    }),
    snippetCompletion("import heapq", {
      label: "import heapq",
      type: "keyword",
      detail: detail.import,
    }),
    { label: "heapq.heappush", type: "function", detail: detail.builtin },
    { label: "heapq.heappop", type: "function", detail: detail.builtin },
    { label: "deque", type: "class", detail: detail.import },
    { label: "defaultdict", type: "class", detail: detail.import },
    { label: "Counter", type: "class", detail: detail.import },
  ];
}

function lineNoteEditFrom(update: ViewUpdate): LineNoteEdit | undefined {
  const edits: LineNoteEdit[] = [];
  update.changes.iterChanges((start, end, _nextStart, _nextEnd, inserted) => {
    edits.push({ start, end, insertedText: inserted.toString() });
  });
  return edits.length === 1 ? edits[0] : undefined;
}

const rootStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  minHeight: 300,
  overflow: "hidden",
  background: "#1e1e1e",
};

export const LeetCodeCodeEditor = forwardRef<
  LeetCodeCodeEditorHandle,
  LeetCodeCodeEditorProps
>(function LeetCodeCodeEditor(
  { value, onChange, onRun, fontSize, language, ariaLabel, onCursorLineChange },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const helpId = useId();
  const viewRef = useRef<EditorView | null>(null);
  const initialValueRef = useRef(value);
  const initialFontSizeRef = useRef(fontSize);
  const initialAriaLabelRef = useRef(ariaLabel);
  const onChangeRef = useRef(onChange);
  const onRunRef = useRef(onRun);
  const onCursorLineChangeRef = useRef(onCursorLineChange);
  const lastCursorLineRef = useRef(1);
  const languageRef = useRef(language);
  const fontSizeCompartmentRef = useRef(new Compartment());
  const accessibilityCompartmentRef = useRef(new Compartment());

  onChangeRef.current = onChange;
  onRunRef.current = onRun;
  onCursorLineChangeRef.current = onCursorLineChange;
  languageRef.current = language;

  const completionSource = useMemo<CompletionSource>(() => (context) => {
    const word = context.matchBefore(/[\w.]*/);
    if (!context.explicit && (!word || word.from === word.to)) return null;

    return {
      from: word?.from ?? context.pos,
      options: completionOptions(languageRef.current),
      validFor: /^[\w.]*$/,
    };
  }, []);

  useImperativeHandle(ref, () => ({
    focus() {
      viewRef.current?.focus();
    },
    indent() {
      return viewRef.current ? indentMore(viewRef.current) : false;
    },
    outdent() {
      return viewRef.current ? indentLess(viewRef.current) : false;
    },
    revealLine(lineNumber, options) {
      const view = viewRef.current;
      if (!view || !Number.isInteger(lineNumber)) return;
      const safeLineNumber = Math.min(Math.max(1, lineNumber), view.state.doc.lines);
      const line = view.state.doc.line(safeLineNumber);
      view.dispatch({
        selection: { anchor: line.from },
        effects: EditorView.scrollIntoView(line.from, { y: "center" }),
      });
      if (options?.focus !== false) view.focus();
    },
  }), []);

  useEffect(() => {
    if (!hostRef.current) return undefined;

    const state = EditorState.create({
      doc: initialValueRef.current,
      extensions: [
        basicSetup,
        python(),
        pythonLanguage.data.of({ autocomplete: completionSource }),
        indentUnit.of("    "),
        EditorState.tabSize.of(4),
        darkEditorTheme,
        syntaxHighlighting(editorHighlightStyle),
        fontSizeCompartmentRef.current.of(fontSizeTheme(initialFontSizeRef.current)),
        accessibilityCompartmentRef.current.of(EditorView.contentAttributes.of({
          "aria-label": initialAriaLabelRef.current,
          "aria-describedby": helpId,
          "aria-multiline": "true",
          "aria-keyshortcuts": "Control+Enter Meta+Enter",
          spellcheck: "false",
          autocapitalize: "off",
          autocorrect: "off",
        })),
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              onRunRef.current();
              return true;
            },
          },
          indentWithTab,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.selectionSet || update.docChanged) {
            const lineNumber = update.state.doc.lineAt(update.state.selection.main.head).number;
            if (lineNumber !== lastCursorLineRef.current) {
              lastCursorLineRef.current = lineNumber;
              onCursorLineChangeRef.current?.(lineNumber);
            }
          }
          if (!update.docChanged) return;
          if (update.transactions.some((transaction) => transaction.annotation(externalDocumentUpdate))) {
            return;
          }
          onChangeRef.current(update.state.doc.toString(), lineNoteEditFrom(update));
        }),
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    lastCursorLineRef.current = view.state.doc.lineAt(view.state.selection.main.head).number;
    onCursorLineChangeRef.current?.(lastCursorLineRef.current);

    return () => {
      viewRef.current = null;
      view.destroy();
    };
  }, [completionSource, helpId]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentValue = view.state.doc.toString();
    if (currentValue === value) return;

    const cursor = Math.min(view.state.selection.main.head, value.length);
    view.dispatch({
      changes: { from: 0, to: currentValue.length, insert: value },
      selection: { anchor: cursor },
      annotations: [
        externalDocumentUpdate.of(true),
        Transaction.addToHistory.of(false),
      ],
    });
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: fontSizeCompartmentRef.current.reconfigure(fontSizeTheme(fontSize)),
    });
  }, [fontSize]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: accessibilityCompartmentRef.current.reconfigure(EditorView.contentAttributes.of({
        "aria-label": ariaLabel,
        "aria-describedby": helpId,
        "aria-multiline": "true",
        "aria-keyshortcuts": "Control+Enter Meta+Enter",
        spellcheck: "false",
        autocapitalize: "off",
        autocorrect: "off",
      })),
    });
  }, [ariaLabel, helpId]);

  return (
    <div style={rootStyle}>
      <p id={helpId} className="sr-only">
        {language === "zh"
          ? "Tab 用于缩进。要离开编辑器，请先按 Escape，再按 Tab。按 Command 或 Control 加 Enter 运行测试。"
          : "Tab indents code. To leave the editor, press Escape and then Tab. Press Command or Control plus Enter to run tests."}
      </p>
      <div ref={hostRef} className="leetcode-code-editor" style={rootStyle} />
    </div>
  );
});

LeetCodeCodeEditor.displayName = "LeetCodeCodeEditor";

export default LeetCodeCodeEditor;
