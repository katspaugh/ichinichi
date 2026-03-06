import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarHeader } from "./CalendarHeader";
import { CalendarGrid } from "./CalendarGrid";
import type { SyncStatus } from "../../types";
import type { PendingOpsSummary } from "../../domain/sync";
import styles from "./Calendar.module.css";

interface CalendarProps {
  year: number;
  hasNote: (date: string) => boolean;
  onDayClick?: (date: string) => void;
  onYearChange: (year: number) => void;
  onMonthClick?: (year: number, month: number) => void;
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
  hasNote,
  onDayClick,
  onYearChange,
  onMonthClick,
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
  const gridRef = useRef<HTMLDivElement>(null);
  const [, setWeekStartVersion] = useState(0);
  const handleWeekStartChange = useCallback(() => {
    setWeekStartVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!window.matchMedia("(max-width: 768px)").matches) {
      return;
    }

    const gridEl = gridRef.current;
    if (!gridEl) return;

    // Always scroll to top when year changes on mobile
    gridEl.scrollTop = 0;

    // On first load of current year, scroll to current month instead
    if (!hasAutoScrolledRef.current) {
      hasAutoScrolledRef.current = true;

      const now = new Date();
      if (year === now.getFullYear() && now.getMonth() > 0) {
        const currentMonthEl = gridEl.querySelector(
          '[data-current-month="true"]',
        );
        if (currentMonthEl instanceof HTMLElement) {
          currentMonthEl.scrollIntoView({
            block: "start",
            behavior: "instant",
          });
        }
      }
    }
  }, [year]);

  return (
    <div
      className={styles.calendar}
      data-week-start-version={weekStartVersion}
    >
      <CalendarHeader
        year={year}
        month={null}
        onYearChange={onYearChange}
        syncStatus={syncStatus}
        syncError={syncError}
        pendingOps={pendingOps}
        onMenuClick={onMenuClick}
        onSignIn={onSignIn}
        onSyncClick={onSyncClick}
      />
      <CalendarGrid
        year={year}
        hasNote={hasNote}
        onDayClick={onDayClick}
        onMonthClick={onMonthClick}
        onWeekStartChange={handleWeekStartChange}
        now={now}
        gridRef={gridRef}
      />
    </div>
  );
}
