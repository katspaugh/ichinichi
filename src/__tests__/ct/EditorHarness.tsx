import { useCallback } from "react";
import { useContentEditableEditor } from "../../components/NoteEditor/useContentEditableEditor";

interface EditorHarnessProps {
  content?: string;
  onChange?: (content: string) => void;
  onImageDrop?: (file: File) => Promise<{
    id: string;
    width: number;
    height: number;
    filename: string;
  }>;
}

export function EditorHarness({
  content = "",
  onChange,
  onImageDrop,
}: EditorHarnessProps) {
  const { editorRef, handleInput, handleKeyDown, handleDrop, handleDragOver } =
    useContentEditableEditor({
      content,
      isEditable: true,
      placeholderText: "",
      onChange: onChange ?? (() => undefined),
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
      onKeyDown={handleKeyDown}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    />
  );
}

/**
 * EditorHarness variant that wires up image drop with a deferred promise.
 * Tests control resolution via window.__resolveImageUpload / __rejectImageUpload.
 */
export function EditorImageDropHarness({
  content = "",
}: {
  content?: string;
}) {
  const onImageDrop = useCallback(() => {
    return new Promise<{
      id: string;
      width: number;
      height: number;
      filename: string;
    }>((resolve, reject) => {
      const w = window as unknown as Record<string, unknown>;
      w.__resolveImageUpload = resolve;
      w.__rejectImageUpload = reject;
    });
  }, []);

  return <EditorHarness content={content} onImageDrop={onImageDrop} />;
}
