import { useCallback, useEffect, useRef } from 'react';
import { Button } from '../Button';
import { formatDateDisplay, isToday } from '../../utils/date';

interface NoteEditorProps {
  date: string;
  content: string;
  onChange: (content: string) => void;
  onClose: () => void;
}

export function NoteEditor({ date, content, onChange, onClose }: NoteEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isEditable = isToday(date);
  const formattedDate = formatDateDisplay(date);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  }, [onChange]);

  // Focus textarea on mount if editable
  useEffect(() => {
    if (isEditable && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditable]);

  return (
    <div className="note-editor">
      <div className="note-editor__header">
        <div>
          <span className="note-editor__date">{formattedDate}</span>
          {!isEditable && (
            <span className="note-editor__readonly-badge">Read only</span>
          )}
        </div>
        <Button icon onClick={onClose} aria-label="Close">
          ✕
        </Button>
      </div>
      <div className="note-editor__body">
        <textarea
          ref={textareaRef}
          className="note-editor__textarea"
          value={content}
          onChange={handleChange}
          readOnly={!isEditable}
          placeholder={isEditable ? "Write your note for today..." : "No note for this day"}
        />
      </div>
    </div>
  );
}
