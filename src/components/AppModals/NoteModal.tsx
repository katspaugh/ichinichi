import { Modal } from "../Modal";
import { NavigationArrow } from "../NavigationArrow";
import { NoteEditor } from "../NoteEditor";
import styles from "./NoteModal.module.css";

interface NoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: string | null;
  shouldRenderNoteEditor: boolean;
  isClosing: boolean;
  hasEdits: boolean;
  isDecrypting: boolean;
  isContentReady: boolean;
  isOfflineStub: boolean;
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
  isOfflineStub,
  content,
  onChange,
  canNavigatePrev,
  canNavigateNext,
  navigateToPrevious,
  navigateToNext,
}: NoteModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      {date && shouldRenderNoteEditor && (
        <div className={styles.modalWrapper}>
          <div className={styles.editorWrapper}>
            <NoteEditor
              date={date}
              content={isContentReady ? content : ""}
              onChange={onChange}
              isClosing={isClosing}
              hasEdits={hasEdits}
              isDecrypting={isDecrypting}
              isContentReady={isContentReady}
              isOfflineStub={isOfflineStub}
            />
          </div>

          <div className={styles.nav}>
            <div className={styles.leftArrow}>
              <NavigationArrow
                direction="left"
                onClick={navigateToPrevious}
                disabled={!canNavigatePrev}
                ariaLabel="Previous note"
              />
            </div>

            <div className={styles.rightArrow}>
              <NavigationArrow
                direction="right"
                onClick={navigateToNext}
                disabled={!canNavigateNext}
                ariaLabel="Next note"
              />
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
