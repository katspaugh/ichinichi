import { render, fireEvent, waitFor } from "@testing-library/react";
import { useContentEditableEditor } from "../components/NoteEditor/useContentEditableEditor";

function setCaretAtEnd(element: HTMLElement) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function EditorHarness({
  content,
  onChange,
}: {
  content: string;
  onChange?: (c: string) => void;
}) {
  const { editorRef, handleInput, handleKeyDown } = useContentEditableEditor({
    content,
    isEditable: true,
    placeholderText: "",
    onChange: onChange ?? (() => undefined),
    showWeather: false,
  });

  return (
    <div
      ref={editorRef}
      data-testid="editor"
      contentEditable={true}
      suppressContentEditableWarning={true}
      onInput={() => handleInput()}
      onKeyDown={handleKeyDown}
    />
  );
}

describe("Structured section transform", () => {
  it("transforms +typename on Enter into section header", async () => {
    const { getByTestId } = render(
      <EditorHarness content="<div>+dream</div>" />,
    );
    const editor = getByTestId("editor") as HTMLDivElement;

    await waitFor(() => {
      expect(editor.innerHTML).toContain("+dream");
    });

    const div = editor.querySelector("div") as HTMLDivElement;
    setCaretAtEnd(div);

    fireEvent.keyDown(editor, { key: "Enter" });

    await waitFor(() => {
      const header = editor.querySelector("[data-section-type]");
      expect(header).not.toBeNull();
      expect(header?.getAttribute("data-section-type")).toBe("dream");
      expect(header?.textContent).toBe("+dream");
    });
  });

  it("does not transform text that doesn't match +typename pattern", async () => {
    const { getByTestId } = render(
      <EditorHarness content="<div>hello world</div>" />,
    );
    const editor = getByTestId("editor") as HTMLDivElement;

    await waitFor(() => {
      expect(editor.innerHTML).toContain("hello world");
    });

    const div = editor.querySelector("div") as HTMLDivElement;
    setCaretAtEnd(div);

    fireEvent.keyDown(editor, { key: "Enter" });

    expect(editor.querySelector("[data-section-type]")).toBeNull();
  });

  it("creates body div after section header", async () => {
    const { getByTestId } = render(
      <EditorHarness content="<div>+dream</div>" />,
    );
    const editor = getByTestId("editor") as HTMLDivElement;

    await waitFor(() => {
      expect(editor.innerHTML).toContain("+dream");
    });

    const div = editor.querySelector("div") as HTMLDivElement;
    setCaretAtEnd(div);

    fireEvent.keyDown(editor, { key: "Enter" });

    await waitFor(() => {
      const header = editor.querySelector("[data-section-type]");
      expect(header).not.toBeNull();
      const body = header?.nextElementSibling;
      expect(body).not.toBeNull();
      expect(body?.tagName).toBe("DIV");
    });
  });

  it("Shift+Enter inside section body inserts br, stays in same div", async () => {
    const { getByTestId } = render(
      <EditorHarness
        content='<div data-section-type="dream">+dream</div><div>body text</div>'
      />,
    );
    const editor = getByTestId("editor") as HTMLDivElement;

    await waitFor(() => {
      expect(editor.querySelector("[data-section-type]")).not.toBeNull();
    });

    const body = editor.querySelector(
      "[data-section-type] + div",
    ) as HTMLDivElement;
    setCaretAtEnd(body);

    fireEvent.keyDown(editor, { key: "Enter", shiftKey: true });

    // Body should still be a single div with a <br> inside
    const header = editor.querySelector("[data-section-type]");
    const bodyAfter = header?.nextElementSibling;
    expect(bodyAfter?.tagName).toBe("DIV");
    expect(bodyAfter?.querySelector("br")).not.toBeNull();
    // Should not have created a new sibling div
    expect(bodyAfter?.nextElementSibling).toBeNull();
  });
});
