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

function EditorHarness({ content }: { content: string }) {
  const { editorRef, handleInput } = useContentEditableEditor({
    content,
    isEditable: true,
    placeholderText: "",
    onChange: () => undefined,
    showWeather: false,
  });

  return (
    <div
      ref={editorRef}
      data-testid="editor"
      contentEditable={true}
      suppressContentEditableWarning={true}
      onInput={() => handleInput()}
    />
  );
}

describe("NoteEditor timestamp HR insertion", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("inserts timestamped HR on first newline after 10 minutes", async () => {
    const startTime = new Date("2026-01-16T10:00:00.000Z");
    const laterTime = new Date(startTime.getTime() + 11 * 60 * 1000);

    jest.setSystemTime(startTime);

    const { getByTestId } = render(
      <EditorHarness content="<p>First</p><p>Second</p>" />,
    );

    const editor = getByTestId("editor") as HTMLDivElement;

    await waitFor(() => {
      expect(editor.innerHTML).toBe("<p>First</p><p>Second</p>");
    });

    const paragraphs = editor.querySelectorAll("p");
    const firstParagraph = paragraphs[0] as HTMLParagraphElement;
    const secondParagraph = paragraphs[1] as HTMLParagraphElement;

    setCaretAtEnd(firstParagraph);
    fireEvent.input(editor);

    setCaretAtEnd(secondParagraph);
    fireEvent.input(editor);

    jest.setSystemTime(laterTime);

    const thirdParagraph = document.createElement("p");
    thirdParagraph.innerHTML = "<br>";
    editor.appendChild(thirdParagraph);

    setCaretAtEnd(thirdParagraph);
    fireEvent.input(editor);

    const insertedHr = thirdParagraph.previousSibling as HTMLElement | null;
    expect(insertedHr?.nodeName).toBe("HR");
    expect(insertedHr?.getAttribute("data-timestamp")).toBe(
      laterTime.toISOString(),
    );
  });

  it("does not mark editor empty when only HR remains", async () => {
    const { getByTestId } = render(
      <EditorHarness content='<hr data-timestamp="2026-01-16T10:00:00.000Z">' />,
    );

    const editor = getByTestId("editor") as HTMLDivElement;

    await waitFor(() => {
      expect(editor.querySelector("hr")).not.toBeNull();
    });

    expect(editor.getAttribute("data-empty")).toBeNull();
  });
});
