import type { ReactNode } from "react";
import { Component } from "react";
import { Button } from "./Button";
import styles from "./ErrorBoundary.module.css";

interface ErrorBoundaryFallbackProps {
  error: Error | null;
  reset: () => void;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  title?: string;
  description?: string;
  resetLabel?: string;
  showReset?: boolean;
  onReset?: () => void;
  fallback?: (props: ErrorBoundaryFallbackProps) => ReactNode;
  fullScreen?: boolean;
  className?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error("ErrorBoundary caught error:", error, info);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    const {
      children,
      title = "Something went wrong",
      description,
      resetLabel = "Try again",
      showReset = true,
      fallback,
      fullScreen = false,
      className,
    } = this.props;
    const { hasError, error } = this.state;

    if (!hasError) {
      return children;
    }

    if (fallback) {
      return fallback({ error, reset: this.handleReset });
    }

    const content = (
      <div className={[styles.boundary, className].filter(Boolean).join(" ")}>
        <div className={styles.title}>{title}</div>
        {description && <div className={styles.description}>{description}</div>}
        {error?.message && <div className={styles.error}>{error.message}</div>}
        {showReset && (
          <div className={styles.actions}>
            <Button variant="primary" onClick={this.handleReset}>
              {resetLabel}
            </Button>
          </div>
        )}
      </div>
    );

    if (fullScreen) {
      return <div className={styles.container}>{content}</div>;
    }

    return content;
  }
}
