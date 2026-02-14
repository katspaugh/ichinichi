import { useEffect, useRef } from "react";
import { useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Dropcursor from "@tiptap/extension-dropcursor";
import { TimestampHorizontalRule } from "../../extensions/timestampHorizontalRule";
import { InlineImage } from "../../extensions/inlineImage";
import type { ImageUploadFn } from "../../extensions/inlineImage";
import styles from "./NoteEditor.module.css";

interface TiptapEditorOptions {
  content: string;
  isEditable: boolean;
  placeholderText: string;
  onChange: (content: string) => void;
  onUserInput?: () => void;
  onImageDrop?: ImageUploadFn;
  onDropComplete?: () => void;
  onWeatherClick?: (editor: Editor, pos: number) => void;
  showWeather: boolean;
  applyWeatherToEditor?: (editor: Editor) => Promise<boolean>;
  clearWeatherFromEditor?: (editor: Editor) => boolean;
  hasWeather?: (attrs: Record<string, unknown>) => boolean;
}

export function useTiptapEditor({
  content,
  isEditable,
  placeholderText,
  onChange,
  onUserInput,
  onImageDrop,
  onDropComplete,
  onWeatherClick,
  showWeather,
  applyWeatherToEditor,
  clearWeatherFromEditor,
  hasWeather,
}: TiptapEditorOptions) {
  const isLocalEditRef = useRef(false);
  const lastContentRef = useRef(content);
  const onChangeRef = useRef(onChange);
  const onUserInputRef = useRef(onUserInput);
  const onWeatherClickRef = useRef(onWeatherClick);
  const hasWeatherRef = useRef(hasWeather);
  const applyWeatherRef = useRef(applyWeatherToEditor);
  const clearWeatherRef = useRef(clearWeatherFromEditor);
  const isWeatherEnabledRef = useRef(showWeather);
  const hasAutoFocusedRef = useRef(false);

  // Keep refs in sync
  useEffect(() => {
    onChangeRef.current = onChange;
    onUserInputRef.current = onUserInput;
    onWeatherClickRef.current = onWeatherClick;
    hasWeatherRef.current = hasWeather;
    applyWeatherRef.current = applyWeatherToEditor;
    clearWeatherRef.current = clearWeatherFromEditor;
  }, [onChange, onUserInput, onWeatherClick, hasWeather, applyWeatherToEditor, clearWeatherFromEditor]);

  useEffect(() => {
    isWeatherEnabledRef.current = showWeather;
  }, [showWeather]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        horizontalRule: false, // Using custom TimestampHorizontalRule
        link: false, // Using standalone Link with custom config
        underline: false, // Using standalone Underline
        dropcursor: false, // Using standalone Dropcursor with custom config
      }),
      TimestampHorizontalRule,
      Underline,
      Link.configure({
        autolink: true,
        openOnClick: false,
        linkOnPaste: true,
        HTMLAttributes: {
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
      InlineImage.configure({
        onImageDrop,
        onDropComplete,
      }),
      Placeholder.configure({
        placeholder: placeholderText,
      }),
      Dropcursor.configure({
        color: "var(--color-link, #3b82f6)",
        width: 2,
      }),
    ],
    content: content || "",
    editable: isEditable,
    editorProps: {
      attributes: {
        class: [
          styles.content,
          isEditable ? styles.contentEditable : styles.contentReadonly,
        ]
          .filter(Boolean)
          .join(" "),
        "data-note-editor": "content",
        role: "textbox",
        "aria-multiline": "true",
        "aria-readonly": String(!isEditable),
      },
      handleClick(view, pos, event) {
        const target = event.target as HTMLElement;

        // Handle anchor clicks
        const anchor = target.closest("a");
        if (anchor && anchor.href) {
          event.preventDefault();
          window.open(anchor.href, "_blank", "noopener,noreferrer");
          return true;
        }

        // Handle HR weather clicks
        if (target.tagName === "HR") {
          const resolvedPos = view.state.doc.resolve(pos);
          // Find the HR node at or around this position
          const nodePos = resolvedPos.before(resolvedPos.depth);
          const node = view.state.doc.nodeAt(nodePos);
          if (
            node?.type.name === "timestampHorizontalRule" &&
            hasWeatherRef.current?.(node.attrs)
          ) {
            event.preventDefault();
            const editorInstance = (view as unknown as { editor?: Editor }).editor;
            if (editorInstance) {
              onWeatherClickRef.current?.(editorInstance, nodePos);
            }
            return true;
          }
        }

        return false;
      },
    },
    onUpdate({ editor: ed }) {
      const html = ed.isEmpty ? "" : ed.getHTML();
      if (html === lastContentRef.current) return;

      lastContentRef.current = html;
      isLocalEditRef.current = true;
      onChangeRef.current(html);
      onUserInputRef.current?.();

      // Apply weather to newly inserted HRs
      if (isWeatherEnabledRef.current && applyWeatherRef.current) {
        void applyWeatherRef.current(ed);
      }
    },
  });

  // Update editable state
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    editor.setEditable(isEditable);

    // Update attributes when editability changes
    const el = editor.view.dom;
    el.setAttribute("aria-readonly", String(!isEditable));
    if (isEditable) {
      el.classList.add(styles.contentEditable);
      el.classList.remove(styles.contentReadonly);
    } else {
      el.classList.remove(styles.contentEditable);
      el.classList.add(styles.contentReadonly);
      hasAutoFocusedRef.current = false;
    }
  }, [editor, isEditable]);

  // Auto-focus when becoming editable
  useEffect(() => {
    if (!editor || editor.isDestroyed || !isEditable) return;
    if (hasAutoFocusedRef.current) return;

    editor.commands.focus("end");
    hasAutoFocusedRef.current = true;
  }, [editor, isEditable]);

  // Sync external content changes
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;

    if (isLocalEditRef.current) {
      isLocalEditRef.current = false;
      lastContentRef.current = content || "";
      return;
    }

    if (content === lastContentRef.current) return;

    const nextContent = content || "";
    lastContentRef.current = nextContent;
    editor.commands.setContent(nextContent, { emitUpdate: false });
  }, [editor, content]);

  // Update placeholder text
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    // Re-configure the placeholder extension
    editor.extensionManager.extensions.forEach((ext) => {
      if (ext.name === "placeholder") {
        (ext.options as { placeholder: string }).placeholder = placeholderText;
      }
    });
    // Force re-render to pick up new placeholder
    editor.view.dispatch(editor.state.tr);
  }, [editor, placeholderText]);

  // Handle weather toggle off
  useEffect(() => {
    if (showWeather || !editor) return;
    clearWeatherRef.current?.(editor);
  }, [showWeather, editor]);

  // Update keyboard shortcuts
  useEffect(() => {
    if (!editor) return;

    // Remap strikethrough to Mod-Shift-x
    const strike = editor.extensionManager.extensions.find(
      (ext) => ext.name === "strike",
    );
    if (strike) {
      strike.options.keyboard = { "Mod-Shift-x": "toggleStrike" };
    }
  }, [editor]);

  // Update image upload handlers when they change
  useEffect(() => {
    if (!editor) return;
    const imageExt = editor.extensionManager.extensions.find(
      (ext) => ext.name === "image",
    );
    if (imageExt) {
      imageExt.options.onImageDrop = onImageDrop;
      imageExt.options.onDropComplete = onDropComplete;
    }
  }, [editor, onImageDrop, onDropComplete]);

  return { editor };
}
