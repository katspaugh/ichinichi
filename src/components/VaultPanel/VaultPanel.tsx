import type { ReactNode } from "react";
import { ModalCard } from "../ModalCard";
import styles from "./VaultPanel.module.css";

interface VaultPanelProps {
  title?: ReactNode;
  helper?: ReactNode;
  children: ReactNode;
}

export function VaultPanel({ title, helper, children }: VaultPanelProps) {
  return (
    <ModalCard maxWidth="sm">
      {title && <h2 className={styles.title}>{title}</h2>}
      {helper && <p className={styles.helper}>{helper}</p>}
      {children}
    </ModalCard>
  );
}
