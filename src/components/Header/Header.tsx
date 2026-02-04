import type { ReactNode } from "react";
import { Menu } from "lucide-react";
import { ErrorBoundary } from "../ErrorBoundary";
import { SyncIndicator } from "../SyncIndicator";
import type { SyncStatus } from "../../types";
import type { PendingOpsSummary } from "../../domain/sync";
import styles from "./Header.module.css";

interface AppLogoProps {
  onClick?: () => void;
}

function AppLogo({ onClick }: AppLogoProps) {
  const content = (
    <>
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
      <span className={styles.appName} lang="ja" title="ichinichi">いちにち</span>
    </>
  );

  if (onClick) {
    return (
      <button
        className={styles.appLogo}
        onClick={onClick}
        aria-label="Go to year view"
      >
        {content}
      </button>
    );
  }

  return <div className={styles.appLogo}>{content}</div>;
}

interface HeaderProps {
  children?: ReactNode;
  syncStatus?: SyncStatus;
  syncError?: string | null;
  pendingOps?: PendingOpsSummary;
  onLogoClick?: () => void;
  onMenuClick?: () => void;
  onSignIn?: () => void;
}

export function Header({
  children,
  syncStatus,
  syncError,
  pendingOps,
  onLogoClick,
  onMenuClick,
  onSignIn,
}: HeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        <AppLogo onClick={onLogoClick} />
      </div>
      {children && <div className={styles.headerCenter}>{children}</div>}
      <div className={styles.headerRight}>
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
            onSignIn={onSignIn}
          />
        </ErrorBoundary>
        <button
          className={styles.menuButton}
          onClick={onMenuClick}
          aria-label="Open settings"
        >
          <Menu className={styles.menuIcon} />
        </button>
      </div>
    </header>
  );
}
