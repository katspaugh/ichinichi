import { useState, useCallback, useEffect, useRef } from "react";
import { Modal } from "../Modal";
import { NavigationArrow } from "../NavigationArrow";
import { ErrorBoundary } from "../ErrorBoundary";
import { NoteEditor } from "../NoteEditor";
import { useOverscrollNavigation } from "../../hooks/useOverscrollNavigation";
import type { HabitValues } from "../../types";
import styles from "./NoteModal.module.css";

interface NoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  date: string | null;
  isCurrentDate: boolean;
  shouldRenderNoteEditor: boolean;
  isClosing: boolean;
  hasEdits: boolean;
  isSaving: boolean;
  isDecrypting: boolean;
  isContentReady: boolean;
  isOfflineStub: boolean;
  content: string;
  onChange: (content: string) => void;
  habits?: HabitValues;
  onHabitChange?: (habits: HabitValues) => void;
  canNavigatePrev: boolean;
  canNavigateNext: boolean;
  navigateToPrevious: () => void;
  navigateToNext: () => void;
}

export function NoteModal({
  isOpen,
  onClose,
  date,
  isCurrentDate,
  shouldRenderNoteEditor,
  isClosing,
  hasEdits,
  isSaving,
  isDecrypting,
  isContentReady,
  isOfflineStub,
  content,
  onChange,
  habits,
  onHabitChange,
  canNavigatePrev,
  canNavigateNext,
  navigateToPrevious,
  navigateToNext,
}: NoteModalProps) {
  const [editorWrapper, setEditorWrapper] = useState<HTMLDivElement | null>(
    null,
  );
  const editorWrapperDomRef = useRef<HTMLDivElement | null>(null);
  const editorWrapperRef = useCallback(
    (node: HTMLDivElement | null) => {
      editorWrapperDomRef.current = node;
      setEditorWrapper(node);
    },
    [],
  );
  const prevDateRef = useRef(date);

  useEffect(() => {
    if (date && prevDateRef.current && date !== prevDateRef.current) {
      const el = editorWrapperDomRef.current;
      if (el) {
        el.scrollTop = 0;

        const cls =
          date < prevDateRef.current
            ? styles.slideInFromTop
            : styles.slideInFromBottom;
        el.classList.add(cls);
        const onEnd = () => el.classList.remove(cls);
        el.addEventListener("animationend", onEnd, { once: true });
      }
    }
    prevDateRef.current = date;
  }, [date]);

  useOverscrollNavigation(editorWrapper, {
    onOverscrollUp: canNavigatePrev ? navigateToPrevious : undefined,
    onOverscrollDown: canNavigateNext ? navigateToNext : undefined,
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      {date && shouldRenderNoteEditor && (
        <div className={styles.modalWrapper}>
          <div className={styles.editorWrapper} ref={editorWrapperRef}>
            <ErrorBoundary
              title="Note editor crashed"
              description="You can reopen the note or continue from the calendar."
              resetLabel="Reload editor"
            >
              <NoteEditor
                date={date}
                content={isContentReady ? content : ""}
                onChange={onChange}
                isClosing={isClosing}
                hasEdits={hasEdits}
                isSaving={isSaving}
                isDecrypting={isDecrypting}
                isContentReady={isContentReady}
                isOfflineStub={isOfflineStub}
                habits={habits}
                onHabitChange={onHabitChange}
              />
            </ErrorBoundary>
          </div>

          <div className={`${styles.nav} ${isCurrentDate ? styles.navCurrentDate : ""}`}>
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
