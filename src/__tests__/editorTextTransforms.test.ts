// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyTextTransforms } from "../services/editorTextTransforms";

function makeEditor(text: string): HTMLElement {
  const editor = document.createElement("div");
  editor.setAttribute("contenteditable", "true");
  editor.textContent = text;
  document.body.appendChild(editor);
  return editor;
}

function setCursor(node: Node, offset: number): void {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

function getCaretTextOffset(editor: HTMLElement): number {
  const selection = window.getSelection()!;
  const range = selection.getRangeAt(0);
  const prefix = document.createRange();
  prefix.selectNodeContents(editor);
  prefix.setEnd(range.startContainer, range.startOffset);
  return prefix.toString().length;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.textContent = "";
});

describe("applyTextTransforms", () => {
  it("keeps caret after pasted link after linkify runs", () => {
    const editor = makeEditor("https://example.com ");
    const textNode = editor.firstChild!;
    setCursor(textNode, textNode.textContent!.length);

    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn((command: string, _showUi: boolean, value?: string) => {
        if (command !== "createLink") {
          return false;
        }

        const selection = window.getSelection()!;
        const range = selection.getRangeAt(0);
        const anchor = document.createElement("a");
        anchor.href = String(value ?? "");
        anchor.textContent = range.toString();
        range.deleteContents();
        range.insertNode(anchor);

        const wrongRange = document.createRange();
        wrongRange.setStart(anchor.firstChild!, 0);
        wrongRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(wrongRange);
        return true;
      }),
    });

    applyTextTransforms(editor);

    expect(editor.innerHTML).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">https://example.com</a> ',
    );
    expect(getCaretTextOffset(editor)).toBe("https://example.com ".length);
  });
});
