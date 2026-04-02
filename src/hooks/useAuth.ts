import { useCallback, useEffect, useReducer } from "react";
import type { Session, User, AuthError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { AUTH_HAS_LOGGED_IN_KEY } from "../utils/constants";
import { AuthState } from "../types";
export { AuthState } from "../types";
import { connectivity } from "../services/connectivity";
import { useConnectivity } from "./useConnectivity";
import {
  fetchKeyring,
  saveKeyring,
  deriveKEK,
  generateDEK,
  generateSalt,
  wrapDEK,
  unwrapDEK,
  computeKeyId,
} from "../crypto";
import { clearAll, deleteDatabase } from "../storage/cache";
import { cacheDek, loadCachedDek, clearDekCache } from "../storage/dekCache";
import { reportError } from "../utils/errorReporter";

export interface UseAuthReturn {
  session: Session | null;
  user: User | null;
  authState: AuthState;
  error: string | null;
  hashError: string | null;
  isBusy: boolean;
  isDekBusy: boolean;
  isPasswordRecovery: boolean;
  dek: CryptoKey | null;
  keyId: string | null;
  signUp: (email: string, password: string) => void;
  signIn: (email: string, password: string) => void;
  signOut: () => Promise<void>;
  unlockDek: (password: string) => void;
  resetPassword: (email: string) => Promise<{ success: boolean }>;
  updatePassword: (password: string) => Promise<{ success: boolean }>;
  clearPasswordRecovery: () => void;
  clearHashError: () => void;
  clearError: () => void;
}

function formatAuthError(error: AuthError): string {
  if (error.message.includes("Invalid login credentials")) {
    return "Invalid email or password.";
  }
  if (error.message.includes("User already registered")) {
    return "An account with this email already exists.";
  }
  if (error.message.includes("Password should be at least")) {
    return "Password must be at least 6 characters.";
  }
  if (error.message.includes("Invalid email")) {
    return "Please enter a valid email address.";
  }
  return error.message;
}

function isSessionMissingError(error: AuthError | null): boolean {
  return Boolean(error && error.name === "AuthSessionMissingError");
}

export type AuthPhase =
  | "bootstrapping"
  | "restoringDek"
  | "idle"
  | "signingIn"
  | "signingUp"
  | "signingOut"
  | "unlockingDek"
  | "generatingDek";

export type AuthEvent =
  | { type: "SESSION_CHANGED"; session: Session | null }
  | { type: "SESSION_VALIDATED"; session: Session | null }
  | { type: "INPUTS_CHANGED"; online: boolean }
  | { type: "SIGN_IN"; email: string; password: string }
  | { type: "SIGN_UP"; email: string; password: string }
  | { type: "SIGN_OUT" }
  | { type: "SIGN_OUT_COMPLETE" }
  | { type: "AUTH_ERROR"; message: string }
  | { type: "CLEAR_ERROR" }
  | { type: "PASSWORD_RECOVERY" }
  | { type: "CLEAR_PASSWORD_RECOVERY" }
  | { type: "HASH_ERROR"; message: string }
  | { type: "CLEAR_HASH_ERROR" }
  | { type: "DEK_UNLOCKED"; dek: CryptoKey; keyId: string }
  | { type: "DEK_ERROR"; message: string }
  | { type: "UNLOCK_DEK"; password: string };

export interface AuthContext {
  phase: AuthPhase;
  session: Session | null;
  authState: AuthState;
  error: string | null;
  isBusy: boolean;
  online: boolean;
  signInInput: { email: string; password: string } | null;
  signUpInput: { email: string; password: string } | null;
  dekInput: { password: string } | null;
  dek: CryptoKey | null;
  keyId: string | null;
  isPasswordRecovery: boolean;
  hashError: string | null;
}

export const initialState: AuthContext = {
  phase: "bootstrapping",
  session: null,
  authState: AuthState.Loading,
  error: null,
  isBusy: false,
  online: connectivity.getOnline(),
  signInInput: null,
  signUpInput: null,
  dekInput: null,
  dek: null,
  keyId: null,
  isPasswordRecovery: false,
  hashError: null,
};

function applySession(
  session: Session | null,
): Partial<AuthContext> {
  return {
    session,
    authState: session ? AuthState.SignedIn : AuthState.SignedOut,
  };
}

function markHasLoggedIn(session: Session | null): void {
  if (typeof window === "undefined") return;
  if (session) {
    localStorage.setItem(AUTH_HAS_LOGGED_IN_KEY, "1");
  }
}

export function authReducer(
  state: AuthContext,
  event: AuthEvent,
): AuthContext {
  switch (event.type) {
    case "CLEAR_ERROR":
      return { ...state, error: null };

    case "INPUTS_CHANGED":
      return { ...state, online: event.online };

    case "AUTH_ERROR":
      return {
        ...state,
        error: event.message,
        isBusy: false,
        phase: state.phase === "bootstrapping"
          ? state.phase
          : "idle",
      };

    case "SESSION_CHANGED": {
      markHasLoggedIn(event.session);
      const sessionUpdate = applySession(event.session);

      // Null session: clear DEK state
      if (!event.session) {
        // Keep signingOut phase so the effect can finish cleanup
        if (state.phase === "signingOut") {
          return {
            ...state,
            ...sessionUpdate,
            isBusy: false,
            dek: null,
            keyId: null,
            dekInput: null,
          };
        }
        return {
          ...state,
          ...sessionUpdate,
          phase: "idle",
          isBusy: false,
          dek: null,
          keyId: null,
          dekInput: null,
          signInInput: null,
          signUpInput: null,
        };
      }

      // Bootstrap with valid session: try restoring cached DEK
      if (state.phase === "bootstrapping") {
        return {
          ...state,
          ...sessionUpdate,
          phase: "restoringDek",
        };
      }

      // Don't disrupt DEK operations with duplicate session events
      if (state.phase === "restoringDek" || state.phase === "unlockingDek" || state.phase === "generatingDek") {
        return state;
      }

      // Sign-in with valid session: auto-transition to unlockingDek
      if (state.phase === "signingIn" && state.signInInput) {
        return {
          ...state,
          ...sessionUpdate,
          phase: "unlockingDek",
          dekInput: { password: state.signInInput.password },
          signInInput: null,
        };
      }

      // Sign-up with valid session: auto-transition to generatingDek
      if (state.phase === "signingUp" && state.signUpInput) {
        return {
          ...state,
          ...sessionUpdate,
          phase: "generatingDek",
          dekInput: { password: state.signUpInput.password },
          signUpInput: null,
        };
      }

      // signingOut or other phases
      if (state.phase === "signingOut") {
        return {
          ...state,
          ...sessionUpdate,
          phase: "idle",
          isBusy: false,
        };
      }

      return { ...state, ...sessionUpdate };
    }

    case "SESSION_VALIDATED":
      return { ...state, ...applySession(event.session) };

    case "SIGN_IN":
      if (state.phase !== "idle") return state;
      return {
        ...state,
        phase: "signingIn",
        error: null,
        isBusy: true,
        signInInput: { email: event.email, password: event.password },
      };

    case "SIGN_UP":
      if (state.phase !== "idle") return state;
      return {
        ...state,
        phase: "signingUp",
        error: null,
        isBusy: true,
        signUpInput: { email: event.email, password: event.password },
      };

    case "SIGN_OUT_COMPLETE":
      return {
        ...state,
        phase: "idle",
        isBusy: false,
        dek: null,
        keyId: null,
        dekInput: null,
        signInInput: null,
        signUpInput: null,
        session: null,
        authState: AuthState.SignedOut,
      };

    case "SIGN_OUT":
      if (state.phase === "signingOut") {
        return { ...state, phase: "idle", isBusy: false };
      }
      if (state.phase !== "idle") return state;
      return {
        ...state,
        phase: "signingOut",
        error: null,
        isBusy: true,
      };

    case "UNLOCK_DEK":
      if (state.phase !== "idle" || !state.session) return state;
      return {
        ...state,
        phase: "unlockingDek",
        error: null,
        isBusy: true,
        dekInput: { password: event.password },
      };

    case "DEK_UNLOCKED":
      return {
        ...state,
        dek: event.dek,
        keyId: event.keyId,
        dekInput: null,
        phase: "idle",
        isBusy: false,
      };

    case "DEK_ERROR":
      return {
        ...state,
        error: event.message,
        dekInput: null,
        phase: "idle",
        isBusy: false,
      };

    case "PASSWORD_RECOVERY":
      return { ...state, isPasswordRecovery: true };

    case "CLEAR_PASSWORD_RECOVERY":
      return { ...state, isPasswordRecovery: false };

    case "HASH_ERROR":
      return { ...state, hashError: event.message };

    case "CLEAR_HASH_ERROR":
      return { ...state, hashError: null };
  }
}

export function useAuth(): UseAuthReturn {
  const online = useConnectivity();
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Parse auth errors from URL hash (e.g. expired reset links)
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes("error_description=")) return;
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const description = params.get("error_description");
    if (description) {
      dispatch({
        type: "HASH_ERROR",
        message: description.replace(/\+/g, " "),
      });
      window.history.replaceState(
        {},
        "",
        window.location.pathname + window.location.search,
      );
    }
  }, []);

  // Bootstrap: getSession + onAuthStateChange listener
  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      const {
        data: { session: initialSession },
      } = await supabase.auth.getSession();
      if (!cancelled) {
        dispatch({
          type: "SESSION_CHANGED",
          session: initialSession,
        });
      }
    };

    void start();

    const { data } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        if (event === "PASSWORD_RECOVERY") {
          dispatch({ type: "PASSWORD_RECOVERY" });
        }
        dispatch({ type: "SESSION_CHANGED", session: newSession });
      },
    );

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  // Forward online changes
  useEffect(() => {
    dispatch({ type: "INPUTS_CHANGED", online });
  }, [online]);

  // Session validation on reconnect
  useEffect(() => {
    if (state.session && online && !state.isBusy) {
      dispatch({
        type: "SESSION_VALIDATED",
        session: state.session,
      });
    }
  }, [state.session, state.isBusy, online]);

  // Sign in effect
  useEffect(() => {
    if (state.phase !== "signingIn" || !state.signInInput) return;

    let cancelled = false;
    const { email, password } = state.signInInput;

    const run = async () => {
      try {
        const { data, error } =
          await supabase.auth.signInWithPassword({ email, password });
        if (cancelled) return;
        if (error) {
          dispatch({
            type: "AUTH_ERROR",
            message: formatAuthError(error),
          });
        } else {
          dispatch({
            type: "SESSION_CHANGED",
            session: data.session ?? null,
          });
        }
      } catch (error) {
        if (cancelled) return;
        dispatch({
          type: "AUTH_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Unable to sign in.",
        });
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [state.phase, state.signInInput]);

  // Sign up effect
  useEffect(() => {
    if (state.phase !== "signingUp" || !state.signUpInput) return;

    let cancelled = false;
    const { email, password } = state.signUpInput;

    const run = async () => {
      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (cancelled) return;
        if (error) {
          dispatch({
            type: "AUTH_ERROR",
            message: formatAuthError(error),
          });
          return;
        }
        dispatch({
          type: "SESSION_CHANGED",
          session: data.session ?? null,
        });
      } catch (error) {
        if (cancelled) return;
        dispatch({
          type: "AUTH_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Unable to sign up.",
        });
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [state.phase, state.signUpInput]);

  // Sign out effect
  useEffect(() => {
    if (state.phase !== "signingOut") return;

    let cancelled = false;

    const run = async () => {
      try {
        const { error } = await supabase.auth.signOut({
          scope: "local",
        });
        if (isSessionMissingError(error)) {
          await supabase.auth.getUser();
        }
      } finally {
        if (!cancelled) {
          try {
            await clearAll();
            await deleteDatabase();
            await clearDekCache();
          } catch (e) {
            reportError("useAuth.signOut.clearCache", e);
          }
          dispatch({ type: "SIGN_OUT_COMPLETE" });
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [state.phase]);

  // Restore cached DEK on bootstrap
  useEffect(() => {
    if (state.phase !== "restoringDek" || !state.session) return;

    let cancelled = false;
    const userId = state.session.user.id;

    const run = async () => {
      try {
        const cached = await loadCachedDek();
        if (cancelled) return;

        if (cached) {
          // Verify cached DEK matches the primary keyring on Supabase
          const keyring = await fetchKeyring(supabase, userId);
          if (cancelled) return;

          if (keyring && keyring.key_id === cached.keyId) {
            dispatch({ type: "DEK_UNLOCKED", dek: cached.dek, keyId: cached.keyId });
            return;
          }

          // Mismatch or no keyring — discard stale cache
          await clearDekCache();
        }

        if (cancelled) return;
        // No valid cache — fall back to manual unlock
        dispatch({ type: "DEK_ERROR", message: "" });
      } catch {
        if (cancelled) return;
        dispatch({ type: "DEK_ERROR", message: "" });
      }
    };

    void run();

    return () => { cancelled = true; };
  }, [state.phase, state.session]);

  // Unlock DEK effect
  useEffect(() => {
    if (state.phase !== "unlockingDek" || !state.dekInput || !state.session) return;

    let cancelled = false;
    const { password } = state.dekInput;
    const userId = state.session.user.id;

    const run = async () => {
      try {
        const keyring = await fetchKeyring(supabase, userId);
        if (cancelled) return;

        if (!keyring) {
          // No keyring yet (e.g. existing account from before E2EE) — generate one
          const dek = await generateDEK();
          if (cancelled) return;
          const keyId = await computeKeyId(dek);
          if (cancelled) return;
          const salt = generateSalt();
          const kek = await deriveKEK(password, salt, 600_000);
          if (cancelled) return;
          const wrapped = await wrapDEK(dek, kek);
          if (cancelled) return;
          await saveKeyring(supabase, userId, {
            key_id: keyId,
            wrapped_dek: wrapped.data,
            dek_iv: wrapped.iv,
            kdf_salt: salt,
            kdf_iterations: 600_000,
            is_primary: true,
          });
          if (cancelled) return;
          await cacheDek(dek, keyId);
          if (cancelled) return;
          dispatch({ type: "DEK_UNLOCKED", dek, keyId });
          return;
        }

        const kek = await deriveKEK(password, keyring.kdf_salt, keyring.kdf_iterations);
        if (cancelled) return;
        const dek = await unwrapDEK(keyring.wrapped_dek, keyring.dek_iv, kek);
        if (cancelled) return;
        const keyId = await computeKeyId(dek);
        if (cancelled) return;
        await cacheDek(dek, keyId);
        if (cancelled) return;
        dispatch({ type: "DEK_UNLOCKED", dek, keyId });
      } catch (error) {
        if (cancelled) return;
        reportError("useAuth.unlockDek", error);
        dispatch({
          type: "DEK_ERROR",
          message: error instanceof Error ? error.message : "Failed to unlock encryption key",
        });
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [state.phase, state.dekInput, state.session]);

  // Generate DEK effect
  useEffect(() => {
    if (state.phase !== "generatingDek" || !state.dekInput || !state.session) return;

    let cancelled = false;
    const { password } = state.dekInput;
    const userId = state.session.user.id;

    const run = async () => {
      try {
        const dek = await generateDEK();
        if (cancelled) return;
        const keyId = await computeKeyId(dek);
        if (cancelled) return;
        const salt = generateSalt();
        const kek = await deriveKEK(password, salt, 600_000);
        if (cancelled) return;
        const wrapped = await wrapDEK(dek, kek);
        if (cancelled) return;
        await saveKeyring(supabase, userId, {
          key_id: keyId,
          wrapped_dek: wrapped.data,
          dek_iv: wrapped.iv,
          kdf_salt: salt,
          kdf_iterations: 600_000,
          is_primary: true,
        });
        if (cancelled) return;
        await cacheDek(dek, keyId);
        if (cancelled) return;
        dispatch({ type: "DEK_UNLOCKED", dek, keyId });
      } catch (error) {
        if (cancelled) return;
        reportError("useAuth.generateDek", error);
        dispatch({
          type: "DEK_ERROR",
          message: error instanceof Error ? error.message : "Failed to generate encryption key",
        });
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [state.phase, state.dekInput, state.session]);

  const signUp = useCallback(
    (email: string, password: string) => {
      dispatch({ type: "SIGN_UP", email, password });
    },
    [],
  );

  const signIn = useCallback(
    (email: string, password: string) => {
      dispatch({ type: "SIGN_IN", email, password });
    },
    [],
  );

  const signOut = useCallback(async () => {
    dispatch({ type: "SIGN_OUT" });
  }, []);

  const unlockDek = useCallback((password: string) => {
    dispatch({ type: "UNLOCK_DEK", password });
  }, []);

  const resetPassword = useCallback(
    async (email: string) => {
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) {
          dispatch({ type: "AUTH_ERROR", message: formatAuthError(error) });
          return { success: false };
        }
        return { success: true };
      } catch (error) {
        dispatch({
          type: "AUTH_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Unable to send reset email.",
        });
        return { success: false };
      }
    },
    [],
  );

  const updatePassword = useCallback(
    async (password: string) => {
      try {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) {
          dispatch({ type: "AUTH_ERROR", message: formatAuthError(error) });
          return { success: false };
        }
        dispatch({ type: "CLEAR_PASSWORD_RECOVERY" });
        return { success: true };
      } catch (error) {
        dispatch({
          type: "AUTH_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Unable to update password.",
        });
        return { success: false };
      }
    },
    [],
  );

  const clearPasswordRecovery = useCallback(() => {
    dispatch({ type: "CLEAR_PASSWORD_RECOVERY" });
  }, []);

  const clearHashError = useCallback(() => {
    dispatch({ type: "CLEAR_HASH_ERROR" });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: "CLEAR_ERROR" });
  }, []);

  return {
    session: state.session,
    user: state.session?.user ?? null,
    authState: state.authState,
    error: state.error,
    hashError: state.hashError,
    isBusy: state.isBusy,
    isDekBusy: state.phase === "restoringDek" || state.phase === "unlockingDek" || state.phase === "generatingDek",
    isPasswordRecovery: state.isPasswordRecovery,
    dek: state.dek,
    keyId: state.keyId,
    signUp,
    signIn,
    signOut,
    unlockDek,
    resetPassword,
    updatePassword,
    clearPasswordRecovery,
    clearHashError,
    clearError,
  };
}
