import { useCallback, useReducer } from "react";
import { Modal } from "../Modal";
import { VaultPanel } from "../VaultPanel";
import { Button } from "../Button";
import styles from "../VaultPanel/VaultPanel.module.css";

interface ResetPasswordModalProps {
  isOpen: boolean;
  error: string | null;
  onSubmit: (password: string) => Promise<{ success: boolean }>;
  onDismiss: () => void;
}

type ResetPasswordPhase = "idle" | "submitting" | "success";

interface ResetPasswordState {
  phase: ResetPasswordPhase;
  password: string;
  confirm: string;
  mismatch: boolean;
}

type ResetPasswordEvent =
  | { type: "SET_PASSWORD"; value: string }
  | { type: "SET_CONFIRM"; value: string }
  | { type: "MISMATCH" }
  | { type: "SUBMIT" }
  | { type: "SUBMIT_SUCCESS" }
  | { type: "SUBMIT_DONE" };

function resetPasswordReducer(
  state: ResetPasswordState,
  event: ResetPasswordEvent,
): ResetPasswordState {
  switch (event.type) {
    case "SET_PASSWORD":
      return { ...state, password: event.value };
    case "SET_CONFIRM":
      return { ...state, confirm: event.value };
    case "MISMATCH":
      return { ...state, mismatch: true };
    case "SUBMIT":
      return { ...state, mismatch: false, phase: "submitting" };
    case "SUBMIT_SUCCESS":
      return { ...state, phase: "success" };
    case "SUBMIT_DONE":
      return { ...state, phase: "idle" };
  }
}

const initialState: ResetPasswordState = {
  phase: "idle",
  password: "",
  confirm: "",
  mismatch: false,
};

export function ResetPasswordModal({
  isOpen,
  error,
  onSubmit,
  onDismiss,
}: ResetPasswordModalProps) {
  const [state, dispatch] = useReducer(resetPasswordReducer, initialState);

  const isBusy = state.phase === "submitting";

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (state.password !== state.confirm) {
        dispatch({ type: "MISMATCH" });
        return;
      }
      dispatch({ type: "SUBMIT" });
      const result = await onSubmit(state.password);
      if (result.success) {
        dispatch({ type: "SUBMIT_SUCCESS" });
      } else {
        dispatch({ type: "SUBMIT_DONE" });
      }
    },
    [state.password, state.confirm, onSubmit],
  );

  if (state.phase === "success") {
    return (
      <Modal isOpen={isOpen} onClose={onDismiss}>
        <VaultPanel title="Password updated">
          <p className={styles.helper}>
            Your password has been changed successfully.
          </p>
          <Button
            className={styles.actionButton}
            variant="primary"
            onClick={onDismiss}
          >
            Done
          </Button>
        </VaultPanel>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onDismiss}>
      <VaultPanel title="Set new password">
        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.label} htmlFor="new-password">
            New password
          </label>
          <input
            id="new-password"
            className={styles.input}
            type="password"
            autoComplete="new-password"
            value={state.password}
            onChange={(e) =>
              dispatch({ type: "SET_PASSWORD", value: e.target.value })
            }
            disabled={isBusy}
            required
            minLength={6}
          />

          <label className={styles.label} htmlFor="confirm-password">
            Confirm password
          </label>
          <input
            id="confirm-password"
            className={styles.input}
            type="password"
            autoComplete="new-password"
            value={state.confirm}
            onChange={(e) =>
              dispatch({ type: "SET_CONFIRM", value: e.target.value })
            }
            disabled={isBusy}
            required
            minLength={6}
          />

          {state.mismatch && (
            <div className={styles.error}>Passwords do not match.</div>
          )}
          {error && <div className={styles.error}>{error}</div>}

          <Button
            className={styles.actionButton}
            variant="primary"
            type="submit"
            disabled={isBusy}
          >
            {isBusy ? "Updating..." : "Update password"}
          </Button>
        </form>
      </VaultPanel>
    </Modal>
  );
}
