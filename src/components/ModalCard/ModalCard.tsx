import type { ReactNode } from "react";
import styles from "./ModalCard.module.css";

interface ModalCardProps {
  children: ReactNode;
  className?: string;
  maxWidth?: "sm" | "md" | "lg";
  fullScreenMobile?: boolean;
}

export function ModalCard({
  children,
  className,
  maxWidth = "md",
  fullScreenMobile = false,
}: ModalCardProps) {
  return (
    <div
      className={styles.container}
      data-full-screen-mobile={fullScreenMobile || undefined}
    >
      <div
        className={`${styles.card} ${className ?? ""}`}
        data-max-width={maxWidth}
        data-full-screen-mobile={fullScreenMobile || undefined}
      >
        {children}
      </div>
    </div>
  );
}
