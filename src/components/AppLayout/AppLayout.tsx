import type { ReactNode } from "react";
import styles from "./AppLayout.module.css";

interface AppLayoutProps {
  header: ReactNode;
  children: ReactNode;
}

export function AppLayout({ header, children }: AppLayoutProps) {
  return (
    <div className={styles.root}>
      {header}
      <div className={styles.content}>{children}</div>
    </div>
  );
}
