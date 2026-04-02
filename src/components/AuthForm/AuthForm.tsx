import { useCallback, useReducer } from "react";
import { Button } from "../Button";
import { VaultPanel } from "../VaultPanel";
import styles from "../VaultPanel/VaultPanel.module.css";

interface AuthFormProps {
  isBusy: boolean;
  error: string | null;
  onSignIn: (email: string, password: string) => void;
  onSignUp: (email: string, password: string) => void;
  onResetPassword?: (email: string) => void;
  defaultPassword?: string | null;
}

interface AuthFormState {
  mode: "signin" | "signup";
  email: string;
  password: string;
  resetSent: boolean;
}

type AuthFormEvent =
  | { type: "SET_EMAIL"; value: string }
  | { type: "SET_PASSWORD"; value: string }
  | { type: "TOGGLE_MODE" }
  | { type: "RESET_SENT" };

function authFormReducer(
  state: AuthFormState,
  event: AuthFormEvent,
): AuthFormState {
  switch (event.type) {
    case "SET_EMAIL":
      return { ...state, email: event.value };
    case "SET_PASSWORD":
      return { ...state, password: event.value };
    case "TOGGLE_MODE":
      return {
        ...state,
        mode: state.mode === "signin" ? "signup" : "signin",
        resetSent: false,
      };
    case "RESET_SENT":
      return { ...state, resetSent: true };
  }
}

export function AuthForm({
  isBusy,
  error,
  onSignIn,
  onSignUp,
  onResetPassword,
  defaultPassword,
}: AuthFormProps) {
  const [state, dispatch] = useReducer(authFormReducer, {
    mode: "signin",
    email: "",
    password: defaultPassword || "",
    resetSent: false,
  });

  const isSignIn = state.mode === "signin";
  const title = isSignIn ? "Sign in to Ichinichi" : "Create an account";
  const buttonText = isSignIn ? "Sign in" : "Create account";
  const toggleText = isSignIn
    ? "Don't have an account?"
    : "Already have an account?";
  const toggleAction = isSignIn ? "Sign up" : "Sign in";

  const handleResetPassword = useCallback(() => {
    if (!state.email || !onResetPassword) return;
    onResetPassword(state.email);
    dispatch({ type: "RESET_SENT" });
  }, [state.email, onResetPassword]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (isSignIn) {
      onSignIn(state.email, state.password);
    } else {
      onSignUp(state.email, state.password);
    }
  };

  return (
    <VaultPanel
      title={title}
      helper="Your notes are encrypted with your password."
    >
      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.label} htmlFor="auth-email">
          Email
        </label>
        <input
          id="auth-email"
          className={styles.input}
          type="email"
          autoComplete="email"
          value={state.email}
          onChange={(e) =>
            dispatch({ type: "SET_EMAIL", value: e.target.value })
          }
          disabled={isBusy}
          required
        />

        <label className={styles.label} htmlFor="auth-password">
          Password
        </label>
        <input
          id="auth-password"
          className={styles.input}
          type="password"
          autoComplete={isSignIn ? "current-password" : "new-password"}
          value={state.password}
          onChange={(e) =>
            dispatch({ type: "SET_PASSWORD", value: e.target.value })
          }
          disabled={isBusy}
          required
          minLength={6}
        />

        {isSignIn && onResetPassword && (
          <p className={styles.note}>
            {state.resetSent ? (
              "Check your email for a reset link."
            ) : (
              <button
                type="button"
                className={styles.toggle}
                onClick={handleResetPassword}
                disabled={isBusy || !state.email}
              >
                Forgot password?
              </button>
            )}
          </p>
        )}

        {error && <div className={styles.error}>{error}</div>}

        <Button
          className={styles.actionButton}
          variant="primary"
          type="submit"
          disabled={isBusy}
        >
          {isBusy ? "Working..." : buttonText}
        </Button>
      </form>

      <p className={styles.note}>
        {toggleText}{" "}
        <button
          type="button"
          className={styles.toggle}
          onClick={() => dispatch({ type: "TOGGLE_MODE" })}
          disabled={isBusy}
        >
          {toggleAction}
        </button>
      </p>
    </VaultPanel>
  );
}
