import { useCallback, useEffect, useReducer } from "react";
import type { Session, User, AuthError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { AUTH_HAS_LOGGED_IN_KEY } from "../utils/constants";
import { AuthState } from "../types";
export { AuthState } from "../types";
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

// ─── Public API ──────────────────────────────────────────────────────────────

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

// ─── Phase enum ──────────────────────────────────────────────────────────────

export const Phase = {
  Bootstrapping: "bootstrapping",
  RestoringDek: "restoringDek",
  Idle: "idle",
  SigningIn: "signingIn",
  SigningUp: "signingUp",
  SigningOut: "signingOut",
  UnlockingDek: "unlockingDek",
  GeneratingDek: "generatingDek",
} as const;

export type Phase = (typeof Phase)[keyof typeof Phase];

// ─── State & events ─────────────────────────────────────────────────────────

export interface AuthContext {
  phase: Phase;
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

export type AuthEvent =
  | { type: "BOOTSTRAP_SESSION"; session: Session | null }
  | { type: "SIGN_IN"; email: string; password: string }
  | { type: "SIGN_UP"; email: string; password: string }
  | { type: "SIGN_OUT" }
  | { type: "UNLOCK_DEK"; password: string }
  | { type: "PHASE_DONE"; phase: Phase; session?: Session | null; dek?: CryptoKey; keyId?: string }
  | { type: "PHASE_ERROR"; message: string }
  | { type: "CLEAR_ERROR" }
  | { type: "PASSWORD_RECOVERY" }
  | { type: "CLEAR_PASSWORD_RECOVERY" }
  | { type: "HASH_ERROR"; message: string }
  | { type: "CLEAR_HASH_ERROR" }
  | { type: "INPUTS_CHANGED"; online: boolean };

export const initialState: AuthContext = {
  phase: Phase.Bootstrapping,
  session: null,
  authState: AuthState.Loading,
  error: null,
  isBusy: false,
  online: navigator.onLine,
  signInInput: null,
  signUpInput: null,
  dekInput: null,
  dek: null,
  keyId: null,
  isPasswordRecovery: false,
  hashError: null,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

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

function markHasLoggedIn(session: Session | null): void {
  if (typeof window === "undefined") return;
  if (session) localStorage.setItem(AUTH_HAS_LOGGED_IN_KEY, "1");
}

// ─── Reducer ────────────────────────────────────────────────────────────────

export function authReducer(
  state: AuthContext,
  event: AuthEvent,
): AuthContext {
  switch (event.type) {
    case "BOOTSTRAP_SESSION": {
      markHasLoggedIn(event.session);
      if (!event.session) {
        return {
          ...state,
          phase: Phase.Idle,
          session: null,
          authState: AuthState.SignedOut,
        };
      }
      // Auto-transition: has session → try restoring cached DEK
      return {
        ...state,
        phase: Phase.RestoringDek,
        session: event.session,
        authState: AuthState.SignedIn,
      };
    }

    case "SIGN_IN":
      if (state.phase !== Phase.Idle) return state;
      return {
        ...state,
        phase: Phase.SigningIn,
        error: null,
        isBusy: true,
        signInInput: { email: event.email, password: event.password },
      };

    case "SIGN_UP":
      if (state.phase !== Phase.Idle) return state;
      return {
        ...state,
        phase: Phase.SigningUp,
        error: null,
        isBusy: true,
        signUpInput: { email: event.email, password: event.password },
      };

    case "SIGN_OUT":
      if (state.phase !== Phase.Idle) return state;
      return {
        ...state,
        phase: Phase.SigningOut,
        error: null,
        isBusy: true,
      };

    case "UNLOCK_DEK":
      if (state.phase !== Phase.Idle || !state.session) return state;
      return {
        ...state,
        phase: Phase.UnlockingDek,
        error: null,
        isBusy: true,
        dekInput: { password: event.password },
      };

    case "PHASE_DONE": {
      // Only accept completions for the current phase
      if (event.phase !== state.phase) return state;

      switch (event.phase) {
        case Phase.SigningIn:
          // Auto-transition: sign-in done → unlock DEK
          return {
            ...state,
            phase: Phase.UnlockingDek,
            session: event.session ?? null,
            authState: event.session ? AuthState.SignedIn : state.authState,
            dekInput: state.signInInput
              ? { password: state.signInInput.password }
              : null,
            signInInput: null,
          };

        case Phase.SigningUp:
          // Auto-transition: sign-up done → generate DEK
          return {
            ...state,
            phase: Phase.GeneratingDek,
            session: event.session ?? null,
            authState: event.session ? AuthState.SignedIn : state.authState,
            dekInput: state.signUpInput
              ? { password: state.signUpInput.password }
              : null,
            signUpInput: null,
          };

        case Phase.SigningOut:
          return {
            ...state,
            phase: Phase.Idle,
            isBusy: false,
            session: null,
            authState: AuthState.SignedOut,
            dek: null,
            keyId: null,
            dekInput: null,
            signInInput: null,
            signUpInput: null,
          };

        case Phase.RestoringDek:
        case Phase.UnlockingDek:
        case Phase.GeneratingDek:
          return {
            ...state,
            phase: Phase.Idle,
            isBusy: false,
            dek: event.dek ?? null,
            keyId: event.keyId ?? null,
            dekInput: null,
          };

        default:
          return state;
      }
    }

    case "PHASE_ERROR":
      return {
        ...state,
        error: event.message,
        isBusy: false,
        phase: state.phase === Phase.Bootstrapping ? state.phase : Phase.Idle,
        dekInput: null,
        signInInput: null,
        signUpInput: null,
      };

    case "CLEAR_ERROR":
      return { ...state, error: null };

    case "INPUTS_CHANGED":
      return { ...state, online: event.online };

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

// ─── Async workers (one per phase) ──────────────────────────────────────────

type Cancelled = () => boolean;

async function doSignIn(
  state: AuthContext,
  cancelled: Cancelled,
): Promise<AuthEvent> {
  if (!state.signInInput) return { type: "PHASE_ERROR", message: "Missing input" };
  const { email, password } = state.signInInput;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (cancelled()) return { type: "CLEAR_ERROR" }; // discarded
  if (error) return { type: "PHASE_ERROR", message: formatAuthError(error) };
  markHasLoggedIn(data.session);
  return { type: "PHASE_DONE", phase: Phase.SigningIn, session: data.session };
}

async function doSignUp(
  state: AuthContext,
  cancelled: Cancelled,
): Promise<AuthEvent> {
  if (!state.signUpInput) return { type: "PHASE_ERROR", message: "Missing input" };
  const { email, password } = state.signUpInput;
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (cancelled()) return { type: "CLEAR_ERROR" };
  if (error) return { type: "PHASE_ERROR", message: formatAuthError(error) };
  markHasLoggedIn(data.session);
  return { type: "PHASE_DONE", phase: Phase.SigningUp, session: data.session };
}

async function doSignOut(cancelled: Cancelled): Promise<AuthEvent> {
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Best effort
  }
  if (cancelled()) return { type: "CLEAR_ERROR" };
  // Fire cleanup concurrently — don't let any single operation block sign-out
  await Promise.allSettled([
    clearAll().then(() => deleteDatabase()),
    clearDekCache(),
  ]);
  return { type: "PHASE_DONE", phase: Phase.SigningOut };
}

async function doRestoreDek(
  state: AuthContext,
  cancelled: Cancelled,
): Promise<AuthEvent> {
  const userId = state.session?.user.id;
  if (!userId) return { type: "PHASE_ERROR", message: "" };

  const cached = await loadCachedDek();
  if (cancelled()) return { type: "CLEAR_ERROR" };

  if (cached) {
    const keyring = await fetchKeyring(supabase, userId);
    if (cancelled()) return { type: "CLEAR_ERROR" };

    if (keyring && keyring.key_id === cached.keyId) {
      return { type: "PHASE_DONE", phase: Phase.RestoringDek, dek: cached.dek, keyId: cached.keyId };
    }
    await clearDekCache();
  }

  // No valid cache — fall back to manual unlock
  return { type: "PHASE_DONE", phase: Phase.RestoringDek };
}

async function doUnlockDek(
  state: AuthContext,
  cancelled: Cancelled,
): Promise<AuthEvent> {
  const userId = state.session?.user.id;
  const password = state.dekInput?.password;
  if (!userId || !password) return { type: "PHASE_ERROR", message: "Missing session or password" };

  const keyring = await fetchKeyring(supabase, userId);
  if (cancelled()) return { type: "CLEAR_ERROR" };

  if (!keyring) {
    // No keyring yet (pre-E2EE account) — generate one
    return doGenerateDek(state, cancelled);
  }

  const kek = await deriveKEK(password, keyring.kdf_salt, keyring.kdf_iterations);
  if (cancelled()) return { type: "CLEAR_ERROR" };
  const dek = await unwrapDEK(keyring.wrapped_dek, keyring.dek_iv, kek);
  if (cancelled()) return { type: "CLEAR_ERROR" };
  const keyId = await computeKeyId(dek);
  if (cancelled()) return { type: "CLEAR_ERROR" };
  await cacheDek(dek, keyId);
  return { type: "PHASE_DONE", phase: Phase.UnlockingDek, dek, keyId };
}

async function doGenerateDek(
  state: AuthContext,
  cancelled: Cancelled,
): Promise<AuthEvent> {
  const userId = state.session?.user.id;
  const password = state.dekInput?.password;
  if (!userId || !password) return { type: "PHASE_ERROR", message: "Missing session or password" };

  const dek = await generateDEK();
  if (cancelled()) return { type: "CLEAR_ERROR" };
  const keyId = await computeKeyId(dek);
  if (cancelled()) return { type: "CLEAR_ERROR" };
  const salt = generateSalt();
  const kek = await deriveKEK(password, salt, 600_000);
  if (cancelled()) return { type: "CLEAR_ERROR" };
  const wrapped = await wrapDEK(dek, kek);
  if (cancelled()) return { type: "CLEAR_ERROR" };
  await saveKeyring(supabase, userId, {
    key_id: keyId,
    wrapped_dek: wrapped.data,
    dek_iv: wrapped.iv,
    kdf_salt: salt,
    kdf_iterations: 600_000,
    is_primary: true,
  });
  if (cancelled()) return { type: "CLEAR_ERROR" };
  await cacheDek(dek, keyId);
  return { type: "PHASE_DONE", phase: Phase.GeneratingDek, dek, keyId };
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useAuth(): UseAuthReturn {
  const online = useConnectivity();
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Effect 1: Bootstrap — get initial session, listen for password recovery
  useEffect(() => {
    let cancelled = false;

    // Parse auth errors from URL hash (e.g. expired reset links)
    const hash = window.location.hash;
    if (hash.includes("error_description=")) {
      const params = new URLSearchParams(hash.replace(/^#/, ""));
      const description = params.get("error_description");
      if (description) {
        dispatch({ type: "HASH_ERROR", message: description.replace(/\+/g, " ") });
        window.history.replaceState({}, "", window.location.pathname + window.location.search);
      }
    }

    const start = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!cancelled) {
        dispatch({ type: "BOOTSTRAP_SESSION", session });
      }
    };
    void start();

    // Only listen for password recovery — all other auth changes are
    // handled by our own effects, so we don't need onAuthStateChange.
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        dispatch({ type: "PASSWORD_RECOVERY" });
      }
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  // Effect 2: Phase-gated async worker
  useEffect(() => {
    let worker: Promise<AuthEvent> | null = null;
    let cancelled = false;
    const isCancelled = () => cancelled;

    switch (state.phase) {
      case Phase.SigningIn:
        worker = doSignIn(state, isCancelled);
        break;
      case Phase.SigningUp:
        worker = doSignUp(state, isCancelled);
        break;
      case Phase.SigningOut:
        worker = doSignOut(isCancelled);
        break;
      case Phase.RestoringDek:
        worker = doRestoreDek(state, isCancelled);
        break;
      case Phase.UnlockingDek:
        worker = doUnlockDek(state, isCancelled);
        break;
      case Phase.GeneratingDek:
        worker = doGenerateDek(state, isCancelled);
        break;
    }

    if (worker) {
      worker
        .then((event) => {
          if (!cancelled) dispatch(event);
        })
        .catch((err) => {
          if (!cancelled) {
            reportError(`useAuth.${state.phase}`, err);
            dispatch({
              type: "PHASE_ERROR",
              message: err instanceof Error ? err.message : "An error occurred",
            });
          }
        });
    }

    return () => { cancelled = true; };
  }, [state.phase, state.signInInput, state.signUpInput, state.dekInput, state.session]);

  // Effect 3: Forward online state
  useEffect(() => {
    dispatch({ type: "INPUTS_CHANGED", online });
  }, [online]);

  // ─── Callbacks ──────────────────────────────────────────────────────────

  const signIn = useCallback(
    (email: string, password: string) => dispatch({ type: "SIGN_IN", email, password }),
    [],
  );

  const signUp = useCallback(
    (email: string, password: string) => dispatch({ type: "SIGN_UP", email, password }),
    [],
  );

  const signOut = useCallback(async () => {
    dispatch({ type: "SIGN_OUT" });
  }, []);

  const unlockDek = useCallback((password: string) => {
    dispatch({ type: "UNLOCK_DEK", password });
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) {
        dispatch({ type: "PHASE_ERROR", message: formatAuthError(error) });
        return { success: false };
      }
      return { success: true };
    } catch (error) {
      dispatch({
        type: "PHASE_ERROR",
        message: error instanceof Error ? error.message : "Unable to send reset email.",
      });
      return { success: false };
    }
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        dispatch({ type: "PHASE_ERROR", message: formatAuthError(error) });
        return { success: false };
      }
      dispatch({ type: "CLEAR_PASSWORD_RECOVERY" });
      return { success: true };
    } catch (error) {
      dispatch({
        type: "PHASE_ERROR",
        message: error instanceof Error ? error.message : "Unable to update password.",
      });
      return { success: false };
    }
  }, []);

  const clearPasswordRecovery = useCallback(() => dispatch({ type: "CLEAR_PASSWORD_RECOVERY" }), []);
  const clearHashError = useCallback(() => dispatch({ type: "CLEAR_HASH_ERROR" }), []);
  const clearError = useCallback(() => dispatch({ type: "CLEAR_ERROR" }), []);

  return {
    session: state.session,
    user: state.session?.user ?? null,
    authState: state.authState,
    error: state.error,
    hashError: state.hashError,
    isBusy: state.isBusy,
    isDekBusy: state.phase === Phase.RestoringDek || state.phase === Phase.UnlockingDek || state.phase === Phase.GeneratingDek,
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
