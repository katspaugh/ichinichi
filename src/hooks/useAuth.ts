import { useCallback, useEffect, useReducer } from "react";
import type { Session, User, AuthError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { AUTH_HAS_LOGGED_IN_KEY } from "../utils/constants";
import { AuthState } from "../types";
export { AuthState } from "../types";
import { connectivity } from "../services/connectivity";
import { useConnectivity } from "./useConnectivity";

export interface UseAuthReturn {
  session: Session | null;
  user: User | null;
  authState: AuthState;
  error: string | null;
  hashError: string | null;
  isBusy: boolean;
  isPasswordRecovery: boolean;
  signUp: (
    email: string,
    password: string,
  ) => Promise<{ success: boolean; password?: string }>;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ success: boolean; password?: string }>;
  signOut: () => Promise<void>;
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

type AuthPhase =
  | "bootstrapping"
  | "idle"
  | "signingIn"
  | "signingUp"
  | "signingOut";

type AuthEvent =
  | { type: "SESSION_CHANGED"; session: Session | null }
  | { type: "SESSION_VALIDATED"; session: Session | null }
  | { type: "INPUTS_CHANGED"; online: boolean }
  | { type: "SIGN_IN"; email: string; password: string }
  | { type: "SIGN_UP"; email: string; password: string }
  | { type: "SIGN_OUT" }
  | { type: "AUTH_ERROR"; message: string }
  | { type: "CLEAR_ERROR" }
  | { type: "PASSWORD_RECOVERY" }
  | { type: "CLEAR_PASSWORD_RECOVERY" }
  | { type: "HASH_ERROR"; message: string }
  | { type: "CLEAR_HASH_ERROR" };

interface AuthContext {
  phase: AuthPhase;
  session: Session | null;
  authState: AuthState;
  error: string | null;
  isBusy: boolean;
  online: boolean;
  signInInput: { email: string; password: string } | null;
  signUpInput: { email: string; password: string } | null;
  isPasswordRecovery: boolean;
  hashError: string | null;
}

const initialState: AuthContext = {
  phase: "bootstrapping",
  session: null,
  authState: AuthState.Loading,
  error: null,
  isBusy: false,
  online: connectivity.getOnline(),
  signInInput: null,
  signUpInput: null,
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

      if (state.phase === "bootstrapping") {
        return {
          ...state,
          ...sessionUpdate,
          phase: "idle",
        };
      }

      if (
        state.phase === "signingIn" ||
        state.phase === "signingUp" ||
        state.phase === "signingOut"
      ) {
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
          dispatch({ type: "SESSION_CHANGED", session: null });
          dispatch({ type: "SIGN_OUT" });
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [state.phase]);

  const signUp = useCallback(
    async (email: string, password: string) => {
      dispatch({ type: "SIGN_UP", email, password });
      return { success: true, password };
    },
    [],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      dispatch({ type: "SIGN_IN", email, password });
      return { success: true, password };
    },
    [],
  );

  const signOut = useCallback(async () => {
    dispatch({ type: "SIGN_OUT" });
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
    isPasswordRecovery: state.isPasswordRecovery,
    signUp,
    signIn,
    signOut,
    resetPassword,
    updatePassword,
    clearPasswordRecovery,
    clearHashError,
    clearError,
  };
}
