import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarHeader } from "./CalendarHeader";
import { CalendarGrid } from "./CalendarGrid";
import type { SyncStatus } from "../../types";
import type { PendingOpsSummary } from "../../domain/sync";
import styles from "./Calendar.module.css";

interface CalendarProps {
  year: number;
  month: number | null;
  hasNote: (date: string) => boolean;
  onDayClick?: (date: string) => void;
  onYearChange: (year: number) => void;
  onMonthChange?: (year: number, month: number) => void;
  onReturnToYear?: () => void;
  syncStatus?: SyncStatus;
  syncError?: string | null;
  pendingOps?: PendingOpsSummary;
  onSignIn?: () => void;
  onSignOut?: () => void;
  now?: Date;
}

export function Calendar({
  year,
  month,
  hasNote,
  onDayClick,
  onYearChange,
  onMonthChange,
  onReturnToYear,
  syncStatus,
  syncError,
  pendingOps,
  onSignIn,
  onSignOut,
  now,
}: CalendarProps) {
  const hasAutoScrolledRef = useRef(false);
  const [, setWeekStartVersion] = useState(0);
  const commitHash = __COMMIT_HASH__;
  const commitUrl = `https://github.com/katspaugh/dailynote/commit/${commitHash}`;
  const handleWeekStartChange = useCallback(() => {
    setWeekStartVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    if (hasAutoScrolledRef.current) {
      return;
    }

    const now = new Date();
    if (year !== now.getFullYear()) {
      return;
    }

    if (now.getMonth() <= 1) {
      return;
    }

    if (!window.matchMedia("(max-width: 768px)").matches) {
      return;
    }

    const currentMonthEl = document.querySelector(
      '[data-current-month="true"]',
    );
    if (currentMonthEl instanceof HTMLElement) {
      currentMonthEl.scrollIntoView({ block: "start", behavior: "smooth" });
      hasAutoScrolledRef.current = true;
    }
  }, [year]);

  return (
    <div className={styles.calendar}>
      <CalendarHeader
        year={year}
        month={month}
        commitHash={commitHash}
        commitUrl={commitUrl}
        onYearChange={onYearChange}
        onMonthChange={onMonthChange}
        onReturnToYear={onReturnToYear}
        syncStatus={syncStatus}
        syncError={syncError}
        pendingOps={pendingOps}
        onSignIn={onSignIn}
        onSignOut={onSignOut}
      />
      <CalendarGrid
        year={year}
        month={month}
        hasNote={hasNote}
        onDayClick={onDayClick}
        onMonthClick={onMonthChange}
        onWeekStartChange={handleWeekStartChange}
        now={now}
      />
    </div>
  );
}
