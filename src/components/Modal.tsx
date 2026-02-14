import { useEffect, useCallback, type ReactNode } from "react";
import { Button } from "./Button";
import { useVisualViewport } from "../hooks/useVisualViewport";
import styles from "./Modal.module.css";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  isCompact?: boolean;
  isDismissable?: boolean;
  variant?: "default" | "overlay";
}

export function Modal({
  isOpen,
  onClose,
  children,
  isCompact = false,
  isDismissable = true,
  variant = "default",
}: ModalProps) {
  useVisualViewport(isOpen);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isDismissable) return;
      if (e.key === "Escape") {
        onClose();
      }
    },
    [isDismissable, onClose],
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isDismissable) return;
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [isDismissable, onClose],
  );

  useEffect(() => {
    if (isOpen) {
      const bodyStyle = document.body.style;
      const htmlStyle = document.documentElement.style;
      const prevBodyOverflow = bodyStyle.overflow;
      const prevHtmlOverflow = htmlStyle.overflow;

      if (isDismissable) {
        document.addEventListener("keydown", handleKeyDown);
      }
      bodyStyle.overflow = "hidden";
      htmlStyle.overflow = "hidden";

      return () => {
        if (isDismissable) {
          document.removeEventListener("keydown", handleKeyDown);
        }
        bodyStyle.overflow = prevBodyOverflow;
        htmlStyle.overflow = prevHtmlOverflow;
      };
    }

    return () => {
      if (isDismissable) {
        document.removeEventListener("keydown", handleKeyDown);
      }
    };
  }, [isDismissable, isOpen, isCompact, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className={styles.backdrop}
      data-variant={variant}
      onClick={handleBackdropClick}
    >
      {isDismissable && (
        <Button
          className={styles.closeButton}
          icon
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </Button>
      )}
      {children}
    </div>
  );
}
