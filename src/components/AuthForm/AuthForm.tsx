import { useState } from "react";
import { Button } from "../Button";
import { VaultPanel } from "../VaultPanel";
import styles from "../VaultPanel/VaultPanel.module.css";

interface AuthFormProps {
  isBusy: boolean;
  error: string | null;
  onSignIn: (email: string, password: string) => void;
  onSignUp: (email: string, password: string) => void;
  defaultPassword?: string | null;
}

export function AuthForm({
  isBusy,
  error,
  onSignIn,
  onSignUp,
  defaultPassword,
}: AuthFormProps) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(defaultPassword || "");

  const isSignIn = mode === "signin";
  const title = isSignIn ? "Sign in to Ichinichi" : "Create an account";
  const buttonText = isSignIn ? "Sign in" : "Create account";
  const toggleText = isSignIn
    ? "Don't have an account?"
    : "Already have an account?";
  const toggleAction = isSignIn ? "Sign up" : "Sign in";

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (isSignIn) {
      onSignIn(email, password);
    } else {
      onSignUp(email, password);
    }
  };

  const handleToggle = () => {
    setMode(isSignIn ? "signup" : "signin");
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
          value={email}
          onChange={(e) => setEmail(e.target.value)}
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
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isBusy}
          required
          minLength={6}
        />

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
          onClick={handleToggle}
          disabled={isBusy}
        >
          {toggleAction}
        </button>
      </p>
    </VaultPanel>
  );
}
