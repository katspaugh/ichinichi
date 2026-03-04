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

  it("transforms +typename after existing content with HRs", async () => {
    const existingContent = [
      '<hr data-timestamp="2026-03-04T07:06:25.486Z" data-label="8:06 AM" contenteditable="false">',
      "Some earlier text.",
      "<div>More content here.</div>",
      '<hr data-timestamp="2026-03-04T08:15:11.652Z" data-label="9:15 AM" contenteditable="false">',
      "<div>Even more content.</div>",
      "<div>+trumpet</div>",
    ].join("");

    const { getByTestId } = render(
      <EditorHarness content={existingContent} />,
    );
    const editor = getByTestId("editor") as HTMLDivElement;

    await waitFor(() => {
      expect(editor.innerHTML).toContain("+trumpet");
    });

    // Find the div containing +trumpet
    const divs = editor.querySelectorAll("div");
    let trumpetDiv: HTMLDivElement | null = null;
    for (const d of divs) {
      if (d.textContent?.trim() === "+trumpet") {
        trumpetDiv = d;
        break;
      }
    }
    expect(trumpetDiv).not.toBeNull();
    setCaretAtEnd(trumpetDiv!);

    fireEvent.keyDown(editor, { key: "Enter" });

    await waitFor(() => {
      const header = editor.querySelector("[data-section-type]");
      expect(header).not.toBeNull();
      expect(header?.getAttribute("data-section-type")).toBe("trumpet");
      expect(header?.textContent).toBe("+trumpet");
    });
  });

  it("transforms +typename when line is bare text (not wrapped in div)", async () => {
    // Simulates typing +trumpet as the first content, where it's a bare text node
    const { getByTestId } = render(<EditorHarness content="" />);
    const editor = getByTestId("editor") as HTMLDivElement;

    // Manually set bare text content (not wrapped in div)
    editor.textContent = "+trumpet";
    setCaretAtEnd(editor);

    fireEvent.keyDown(editor, { key: "Enter" });

    await waitFor(() => {
      const header = editor.querySelector("[data-section-type]");
      expect(header).not.toBeNull();
      expect(header?.getAttribute("data-section-type")).toBe("trumpet");
    });
  });

  it("transforms +typename after typing with handleInput triggering timestamp insertion", async () => {
    // Simulate a note with existing content where last edit was >10 min ago
    const oldTimestamp = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const existingContent = [
      `<hr data-timestamp="${oldTimestamp}" data-label="earlier" contenteditable="false">`,
      "<div>Some existing content from earlier.</div>",
    ].join("");

    const onChange = jest.fn();
    const { getByTestId } = render(
      <EditorHarness content={existingContent} onChange={onChange} />,
    );
    const editor = getByTestId("editor") as HTMLDivElement;

    await waitFor(() => {
      expect(editor.innerHTML).toContain("Some existing content");
    });

    // Simulate: user clicks into editor, types +trumpet in a new div at the end
    // In real browser, pressing Enter creates a new div, then user types in it
    const newDiv = document.createElement("div");
    newDiv.textContent = "+trumpet";
    editor.appendChild(newDiv);
    setCaretAtEnd(newDiv);

    // Simulate typing — this triggers handleInput which may insert timestamp HR
    fireEvent.input(editor);

    // Now press Enter to trigger section transform
    fireEvent.keyDown(editor, { key: "Enter" });

    await waitFor(() => {
      const header = editor.querySelector("[data-section-type]");
      expect(header).not.toBeNull();
      expect(header?.getAttribute("data-section-type")).toBe("trumpet");
      expect(header?.textContent).toBe("+trumpet");
    });
  });

  it("transforms +typename in div that also contains an HR", async () => {
    // Reproduce the exact DOM structure from user's bug report:
    // <div><hr contenteditable="false">+trumpet</div>
    const contentWithHrInDiv = [
      "<div>Earlier content.</div>",
      '<div><hr data-timestamp="2026-03-04T21:16:08.647Z" data-label="10:16 PM" contenteditable="false">+trumpet</div>',
    ].join("");

    const { getByTestId } = render(
      <EditorHarness content={contentWithHrInDiv} />,
    );
    const editor = getByTestId("editor") as HTMLDivElement;

    await waitFor(() => {
      expect(editor.innerHTML).toContain("+trumpet");
    });

    // Find the text node with +trumpet
    const divs = editor.querySelectorAll("div");
    let trumpetDiv: HTMLDivElement | null = null;
    for (const d of divs) {
      if (d.textContent?.includes("+trumpet")) {
        trumpetDiv = d;
        break;
      }
    }
    expect(trumpetDiv).not.toBeNull();

    // Place caret at end of the +trumpet text (after the HR)
    const walker = document.createTreeWalker(trumpetDiv!, NodeFilter.SHOW_TEXT);
    let textNode: Text | null = null;
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      if (node.textContent?.includes("+trumpet")) {
        textNode = node;
        break;
      }
    }
    expect(textNode).not.toBeNull();
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.setStart(textNode!, textNode!.textContent!.length);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);

    fireEvent.keyDown(editor, { key: "Enter" });

    await waitFor(() => {
      const header = editor.querySelector("[data-section-type]");
      expect(header).not.toBeNull();
      expect(header?.getAttribute("data-section-type")).toBe("trumpet");
      expect(header?.textContent).toBe("+trumpet");
    });
  });
});
