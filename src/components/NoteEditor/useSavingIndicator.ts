import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hook to manage the "Saving..." indicator display timing.
 *
 * The indicator appears after the user stops typing for a short delay,
 * and stays visible until saving completes (plus a minimum display time).
 * If the user resumes typing, the indicator is hidden immediately.
 *
 * @param isEditable - Whether the editor is editable
 * @param isSaving - Whether the note is currently being saved (dirty or saving state)
 */
export function useSavingIndicator(isEditable: boolean, isSaving: boolean) {
  const [showSaving, setShowSaving] = useState(false);
  const idleTimerRef = useRef<number | null>(null);
  const minDisplayTimerRef = useRef<number | null>(null);

  // Idle time before showing the indicator (ms)
  const IDLE_DELAY = 2000;

  const clearTimers = useCallback(() => {
    if (idleTimerRef.current !== null) {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
    if (minDisplayTimerRef.current !== null) {
      window.clearTimeout(minDisplayTimerRef.current);
      minDisplayTimerRef.current = null;
    }
  }, []);

  // Called on each user input to schedule showing the indicator
  const scheduleSavingIndicator = useCallback(() => {
    if (!isEditable) {
      return;
    }

    // User is typing - hide indicator immediately and reset timers
    clearTimers();
    setShowSaving(false);

    // Start a new idle timer - show indicator after user stops typing
    idleTimerRef.current = window.setTimeout(() => {
      if (isSaving) {
        setShowSaving(true);
      }
    }, IDLE_DELAY);
  }, [isEditable, isSaving, clearTimers]);

  // Handle hiding the indicator when saving completes
  useEffect(() => {
    if (!isSaving && showSaving) {
      // Saving completed - hide after a brief moment so user can see it
      minDisplayTimerRef.current = window.setTimeout(() => {
        setShowSaving(false);
      }, 300);
    }
  }, [isSaving, showSaving]);

  // Cleanup timers on unmount
  useEffect(() => {
    return clearTimers;
  }, [clearTimers]);

  // Derive effective state: never show if not editable
  const effectiveShowSaving = isEditable ? showSaving : false;

  return { showSaving: effectiveShowSaving, scheduleSavingIndicator };
}
