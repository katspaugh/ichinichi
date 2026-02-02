import { Menu, ChevronLeft, ChevronRight } from "lucide-react";
import { ErrorBoundary } from "../ErrorBoundary";
import { SyncIndicator } from "../SyncIndicator";
import type { SyncStatus } from "../../types";
import type { PendingOpsSummary } from "../../domain/sync";
import { getMonthName } from "../../utils/date";
import styles from "./Calendar.module.css";

function AppLogo() {
  return (
    <div className={styles.appLogo}>
      <div className={styles.logoIcon}>
        <svg width="24" height="22" viewBox="0 0 24 22" fill="none">
          <g transform="translate(0, 4)">
            <rect
              x="0"
              y="0"
              width="18"
              height="18"
              rx="3"
              fill="#FFFFFF"
              transform="rotate(-6, 9, 9)"
            />
            <g transform="rotate(-6, 9, 9)">
              <rect x="4" y="5" width="10" height="1.5" rx="0.75" fill="#A1A1AA" />
              <rect x="4" y="8.5" width="8" height="1" rx="0.5" fill="#D4D4D8" />
            </g>
          </g>
          <ellipse cx="19" cy="5" rx="5" ry="5" fill="#FCD34D" />
        </svg>
      </div>
      <span className={styles.appName}>いちにち</span>
    </div>
  );
}

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
        <AppLogo />
      </div>
      <div className={styles.yearControls}>
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
      </div>
      <div className={styles.headerRight}>
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
        <button
          className={styles.menuButton}
          onClick={onMenuClick}
          aria-label="Open settings"
        >
          <Menu className={styles.menuIcon} />
        </button>
      </div>
    </div>
  );
}
