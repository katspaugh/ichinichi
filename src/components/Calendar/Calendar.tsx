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
  onMenuClick?: () => void;
  onSignIn?: () => void;
  onSyncClick?: () => void;
  now?: Date;
  weekStartVersion?: number;
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
  onMenuClick,
  onSignIn,
  onSyncClick,
  now,
  weekStartVersion,
}: CalendarProps) {
  const hasAutoScrolledRef = useRef(false);
  const [, setWeekStartVersion] = useState(0);
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

    if (now.getMonth() <= 0) {
      return;
    }

    if (!window.matchMedia("(max-width: 768px)").matches) {
      return;
    }

    const currentMonthEl = document.querySelector(
      '[data-current-month="true"]',
    );
    if (currentMonthEl instanceof HTMLElement) {
      // Use instant scroll so snap doesn't fight smooth animation
      currentMonthEl.scrollIntoView({ block: "start", behavior: "instant" });
      hasAutoScrolledRef.current = true;
    }
  }, [year]);

  return (
    <div
      className={styles.calendar}
      data-week-start-version={weekStartVersion}
    >
      <CalendarHeader
        year={year}
        month={month}
        onYearChange={onYearChange}
        onMonthChange={onMonthChange}
        onReturnToYear={onReturnToYear}
        onLogoClick={onReturnToYear}
        syncStatus={syncStatus}
        syncError={syncError}
        pendingOps={pendingOps}
        onMenuClick={onMenuClick}
        onSignIn={onSignIn}
        onSyncClick={onSyncClick}
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
