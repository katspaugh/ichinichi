import { EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/core";

interface NoteEditorContentProps {
  editor: Editor | null;
}

export function NoteEditorContent({ editor }: NoteEditorContentProps) {
  return <EditorContent editor={editor} />;
}
