import { useEffect } from "react";
import type { RefObject } from "react";
import { applySectionColors } from "../../services/sectionColors";

const SECTION_TYPE_RE = /^\+([a-z][a-z-]*)$/;

/**
 * Attach a beforeinput listener that converts +typename lines into
 * structured section headers when the user presses Enter.
 * Calls onTransform after modifying the DOM so the parent can sync.
 */
export function useSectionTransform(
  editorRef: RefObject<HTMLElement | null>,
  onTransform?: () => void,
) {
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;

    const handleBeforeInput = (event: InputEvent) => {
      if (
        event.inputType !== "insertParagraph" &&
        event.inputType !== "insertLineBreak"
      ) {
        return;
      }

      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      let container: Node | null = range.startContainer;
      const textNode =
        container.nodeType === Node.TEXT_NODE ? container : null;
      if (container.nodeType === Node.TEXT_NODE) {
        container = container.parentNode;
      }

      let block: HTMLElement | null = null;
      let current: Node | null = container;
      while (current && current !== el) {
        if (
          current instanceof HTMLElement &&
          (current.tagName === "DIV" || current.tagName === "P")
        ) {
          block = current;
          break;
        }
        current = current.parentNode;
      }

      // Bare text node directly inside editor — wrap in div first
      if (!block && container === el) {
        const targetNode =
          textNode ??
          (() => {
            for (const child of Array.from(el.childNodes)) {
              if (
                child.nodeType === Node.TEXT_NODE &&
                (child.textContent ?? "").trim().match(SECTION_TYPE_RE)
              ) {
                return child;
              }
            }
            return null;
          })();
        if (targetNode && targetNode.parentNode === el) {
          const text = (targetNode.textContent ?? "").trim();
          if (text.match(SECTION_TYPE_RE)) {
            const wrapper = document.createElement("div");
            el.insertBefore(wrapper, targetNode);
            wrapper.appendChild(targetNode);
            block = wrapper;
          }
        }
      }

      if (!block) return;

      const text = (block.textContent ?? "").trim();
      const match = text.match(SECTION_TYPE_RE);
      if (!match) return;

      event.preventDefault();
      const typeName = match[1];
      block.setAttribute("data-section-type", typeName);
      block.textContent = "+" + typeName;

      const body = document.createElement("div");
      body.appendChild(document.createElement("br"));
      block.parentNode?.insertBefore(body, block.nextSibling);

      applySectionColors(el);

      const sel = window.getSelection();
      if (sel) {
        const r = document.createRange();
        r.setStart(body, 0);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      }

      onTransform?.();
    };

    el.addEventListener("beforeinput", handleBeforeInput);
    return () => {
      el.removeEventListener("beforeinput", handleBeforeInput);
    };
  }, [editorRef, onTransform]);
}
