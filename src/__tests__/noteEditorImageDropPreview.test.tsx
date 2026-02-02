import { act, fireEvent, render } from "@testing-library/react";
import { useContentEditableEditor } from "../components/NoteEditor/useContentEditableEditor";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function EditorHarness({
  onImageDrop,
}: {
  onImageDrop: (file: File) => Promise<{
    id: string;
    width: number;
    height: number;
    filename: string;
  }>;
}) {
  const { editorRef, handleInput, handleDrop } = useContentEditableEditor({
    content: "",
    isEditable: true,
    placeholderText: "",
    onChange: () => undefined,
    onImageDrop,
    showWeather: false,
  });

  return (
    <div
      ref={editorRef}
      data-testid="editor"
      contentEditable={true}
      suppressContentEditableWarning={true}
      onInput={() => handleInput()}
      onDrop={handleDrop}
    />
  );
}

describe("NoteEditor image drop preview", () => {
  beforeEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      value: jest.fn(() => "blob:preview-url"),
      writable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      value: jest.fn(),
      writable: true,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("renders dropped images immediately using a blob URL", async () => {
    const deferred = createDeferred<{
      id: string;
      width: number;
      height: number;
      filename: string;
    }>();
    const onImageDrop = jest.fn(() => deferred.promise);

    const { getByTestId } = render(<EditorHarness onImageDrop={onImageDrop} />);
    const editor = getByTestId("editor") as HTMLDivElement;
    editor.getBoundingClientRect = jest.fn(
      () =>
        ({
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          width: 0,
          height: 0,
          x: 0,
          y: 0,
          toJSON: () => "",
        }) as DOMRect,
    );

    const file = new File(["data"], "photo.png", { type: "image/png" });
    fireEvent.drop(editor, {
      dataTransfer: { files: [file] },
      clientX: 0,
      clientY: 10,
    });

    const preview = editor.querySelector('img[data-image-id="uploading"]');
    expect(preview?.getAttribute("src")).toBe("blob:preview-url");
    expect(URL.createObjectURL).toHaveBeenCalledWith(file);

    await act(async () => {
      deferred.resolve({
        id: "img-1",
        width: 120,
        height: 80,
        filename: "photo.png",
      });
      await Promise.resolve();
    });

    const finalImage = editor.querySelector('img[data-image-id="img-1"]');
    expect(finalImage).toBeTruthy();
    expect(finalImage?.getAttribute("src")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview-url");
  });
});
