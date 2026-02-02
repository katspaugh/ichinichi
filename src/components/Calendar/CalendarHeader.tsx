import { Menu } from "lucide-react";
import { Button } from "../Button";
import { ErrorBoundary } from "../ErrorBoundary";
import { SyncIndicator } from "../SyncIndicator";
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
  syncStatus,
  syncError,
  pendingOps,
  onMenuClick,
  onSignIn,
}: CalendarHeaderProps) {
  return (
    <div className={styles.header}>
      <div className={styles.headerLeft}>
        <button
          className={styles.menuButton}
          onClick={onMenuClick}
          aria-label="Open settings"
        >
          <Menu className={styles.menuIcon} />
        </button>
      </div>
      <div className={styles.yearControls}>
        {month == null ? (
          <>
            <Button
              icon
              onClick={() => onYearChange(year - 1)}
              aria-label="Previous year"
            >
              ←
            </Button>
            <span className={styles.year}>{year}</span>
            <Button
              icon
              onClick={() => onYearChange(year + 1)}
              aria-label="Next year"
            >
              →
            </Button>
          </>
        ) : (
          <>
            <Button
              icon
              onClick={() => {
                const prevMonth = month === 0 ? 11 : month - 1;
                const prevYear = month === 0 ? year - 1 : year;
                onMonthChange?.(prevYear, prevMonth);
              }}
              aria-label="Previous month"
            >
              ←
            </Button>
            <button
              className={styles.yearMonth}
              onClick={onReturnToYear}
              aria-label="Return to year view"
            >
              {year}, {getMonthName(month)}
            </button>
            <Button
              icon
              onClick={() => {
                const nextMonth = month === 11 ? 0 : month + 1;
                const nextYear = month === 11 ? year + 1 : year;
                onMonthChange?.(nextYear, nextMonth);
              }}
              aria-label="Next month"
            >
              →
            </Button>
          </>
        )}
      </div>
      <div className={styles.headerActions}>
        {syncStatus && (
          <ErrorBoundary
            title="Sync status unavailable"
            description="Sync will resume automatically once ready."
            resetLabel="Retry"
            className={styles.syncErrorBoundary}
          >
            <SyncIndicator
              status={syncStatus}
              pendingOps={pendingOps}
              errorMessage={syncError ?? undefined}
            />
          </ErrorBoundary>
        )}
        {onSignIn && (
          <button className={styles.signInButton} onClick={onSignIn}>
            Sign in
          </button>
        )}
      </div>
    </div>
  );
}
