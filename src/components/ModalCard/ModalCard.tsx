import type { ReactNode, Ref } from "react";
import styles from "./ModalCard.module.css";

interface ModalCardProps {
  children: ReactNode;
  className?: string;
  maxWidth?: "sm" | "md" | "lg";
  fullScreenMobile?: boolean;
  cardRef?: Ref<HTMLDivElement>;
}

export function ModalCard({
  children,
  className,
  maxWidth = "md",
  fullScreenMobile = false,
  cardRef,
}: ModalCardProps) {
  return (
    <div
      className={styles.container}
      data-full-screen-mobile={fullScreenMobile || undefined}
    >
      <div
        ref={cardRef}
        className={`${styles.card} ${className ?? ""}`}
        data-max-width={maxWidth}
        data-full-screen-mobile={fullScreenMobile || undefined}
      >
        {children}
      </div>
    </div>
  );
}
