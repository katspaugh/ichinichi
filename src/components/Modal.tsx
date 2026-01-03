import { useEffect, useCallback, type ReactNode } from 'react';
import { Button } from './Button';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  variant?: 'default' | 'overlay';
}

export function Modal({ isOpen, onClose, children, variant = 'default' }: ModalProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      const bodyStyle = document.body.style;
      const htmlStyle = document.documentElement.style;
      const prevBodyOverflow = bodyStyle.overflow;
      const prevHtmlOverflow = htmlStyle.overflow;

      document.addEventListener('keydown', handleKeyDown);
      bodyStyle.overflow = 'hidden';
      htmlStyle.overflow = 'hidden';

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        bodyStyle.overflow = prevBodyOverflow;
        htmlStyle.overflow = prevHtmlOverflow;
      };
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  // Overlay variant: just backdrop + children, no modal-content wrapper
  if (variant === 'overlay') {
    return (
      <div className="modal-backdrop" onClick={handleBackdropClick}>
        {children}
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <Button
        className="modal-close-button"
        icon
        onClick={onClose}
        aria-label="Close"
      >
        ✕
      </Button>
      <div className="modal-content">
        {children}
      </div>
    </div>
  );
}
