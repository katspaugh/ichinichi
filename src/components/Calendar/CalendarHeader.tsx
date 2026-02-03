import { ChevronLeft, ChevronRight } from "lucide-react";
import { Header } from "../Header";
import type { SyncStatus } from "../../types";
import type { PendingOpsSummary } from "../../domain/sync";
import { getMonthName } from "../../utils/date";
import styles from "./Calendar.module.css";

interface CalendarHeaderProps {
  year: number;
  month: number | null;
  onYearChange: (year: number) => void;
  onMonthChange?: (year: number, month: number) => void;
  onReturnToYear?: () => void;
  onLogoClick?: () => void;
  syncStatus?: SyncStatus;
  syncError?: string | null;
  pendingOps?: PendingOpsSummary;
  onMenuClick?: () => void;
  onSignIn?: () => void;
}

export function CalendarHeader({
  year,
  month,
  onYearChange,
  onMonthChange,
  onReturnToYear,
  onLogoClick,
  syncStatus,
  syncError,
  pendingOps,
  onMenuClick,
  onSignIn,
}: CalendarHeaderProps) {
  return (
    <Header
      syncStatus={syncStatus}
      syncError={syncError}
      pendingOps={pendingOps}
      onLogoClick={onLogoClick}
      onMenuClick={onMenuClick}
      onSignIn={onSignIn}
    >
      {month == null ? (
        <>
          <button
            className={styles.navButton}
            onClick={() => onYearChange(year - 1)}
            aria-label="Previous year"
          >
            <ChevronLeft className={styles.navIcon} />
          </button>
          <span className={styles.year}>{year}</span>
          <button
            className={styles.navButton}
            onClick={() => onYearChange(year + 1)}
            aria-label="Next year"
          >
            <ChevronRight className={styles.navIcon} />
          </button>
        </>
      ) : (
        <>
          <button
            className={styles.navButton}
            onClick={() => {
              const prevMonth = month === 0 ? 11 : month - 1;
              const prevYear = month === 0 ? year - 1 : year;
              onMonthChange?.(prevYear, prevMonth);
            }}
            aria-label="Previous month"
          >
            <ChevronLeft className={styles.navIcon} />
          </button>
          <button
            className={styles.yearMonth}
            onClick={onReturnToYear}
            aria-label="Return to year view"
          >
            {year}, {getMonthName(month)}
          </button>
          <button
            className={styles.navButton}
            onClick={() => {
              const nextMonth = month === 11 ? 0 : month + 1;
              const nextYear = month === 11 ? year + 1 : year;
              onMonthChange?.(nextYear, nextMonth);
            }}
            aria-label="Next month"
          >
            <ChevronRight className={styles.navIcon} />
          </button>
        </>
      )}
    </Header>
  );
}
