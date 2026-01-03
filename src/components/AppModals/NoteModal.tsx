import { Modal } from '../Modal';
import { NavigationArrow } from '../NavigationArrow';
import { NoteEditor } from '../NoteEditor';

interface NoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: string | null;
  shouldRenderNoteEditor: boolean;
  isClosing: boolean;
  hasEdits: boolean;
  isDecrypting: boolean;
  isContentReady: boolean;
  content: string;
  onChange: (content: string) => void;
  canNavigatePrev: boolean;
  canNavigateNext: boolean;
  navigateToPrevious: () => void;
  navigateToNext: () => void;
}

export function NoteModal({
  isOpen,
  onClose,
  date,
  shouldRenderNoteEditor,
  isClosing,
  hasEdits,
  isDecrypting,
  isContentReady,
  content,
  onChange,
  canNavigatePrev,
  canNavigateNext,
  navigateToPrevious,
  navigateToNext
}: NoteModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      {date && shouldRenderNoteEditor && (
        <>
          <NavigationArrow
            direction="left"
            onClick={navigateToPrevious}
            disabled={!canNavigatePrev}
            ariaLabel="Previous note"
          />
          <NavigationArrow
            direction="right"
            onClick={navigateToNext}
            disabled={!canNavigateNext}
            ariaLabel="Next note"
          />
          <div className="note-editor-wrapper">
            <NoteEditor
              date={date}
              content={isContentReady ? content : ''}
              onChange={onChange}
              isClosing={isClosing}
              hasEdits={hasEdits}
              isDecrypting={isDecrypting}
              isContentReady={isContentReady}
            />
          </div>
        </>
      )}
    </Modal>
  );
}
