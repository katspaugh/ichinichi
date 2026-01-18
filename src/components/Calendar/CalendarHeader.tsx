import { Button } from "../Button";
import { ErrorBoundary } from "../ErrorBoundary";
import { SyncIndicator } from "../SyncIndicator";
import { ThemeToggle } from "../ThemeToggle";
import type { SyncStatus } from "../../types";
import type { PendingOpsSummary } from "../../domain/sync";
import { getMonthName } from "../../utils/date";
import styles from "./Calendar.module.css";

interface CalendarHeaderProps {
  year: number;
  month: number | null;
  commitHash: string;
  commitUrl: string;
  onYearChange: (year: number) => void;
  onMonthChange?: (year: number, month: number) => void;
  onReturnToYear?: () => void;
  syncStatus?: SyncStatus;
  syncError?: string | null;
  pendingOps?: PendingOpsSummary;
  onSignIn?: () => void;
  onSignOut?: () => void;
}

export function CalendarHeader({
  year,
  month,
  commitHash,
  commitUrl,
  onYearChange,
  onMonthChange,
  onReturnToYear,
  syncStatus,
  syncError,
  pendingOps,
  onSignIn,
  onSignOut,
}: CalendarHeaderProps) {
  return (
    <div className={styles.header}>
      <div className={styles.headerLeft}>
        <a
          className={styles.auth}
          href={commitUrl}
          target="_blank"
          rel="noreferrer"
        >
          <span className={styles.footerIcon} aria-hidden="true" />
          {commitHash}
        </a>
        <ThemeToggle />
      </div>
      <div className={styles.headerSpacer} aria-hidden="true" />
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
          <button className={styles.auth} onClick={onSignIn}>
            Sign in to sync
          </button>
        )}
        {onSignOut && (
          <button className={styles.auth} onClick={onSignOut}>
            Sign out
          </button>
        )}
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
    </div>
  );
}
