import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, User, AuthError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { AUTH_HAS_LOGGED_IN_KEY } from "../utils/constants";
import { AuthState } from "../types";
import { connectivity } from "../services/connectivity";
import { useConnectivity } from "./useConnectivity";

export interface UseAuthReturn {
  session: Session | null;
  user: User | null;
  authState: AuthState;
  error: string | null;
  isBusy: boolean;
  confirmationEmail: string | null;
  signUp: (
    email: string,
    password: string,
  ) => Promise<{ success: boolean; password?: string }>;
  signIn: (
    email: string,
    password: string,
  ) => Promise<{ success: boolean; password?: string }>;
  signOut: () => Promise<void>;
  clearError: () => void;
  backToSignIn: () => void;
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

export function useAuth(): UseAuthReturn {
  const [session, setSession] = useState<Session | null>(null);
  const [authState, setAuthState] = useState<AuthState>(AuthState.Loading);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(
    null,
  );
  const online = useConnectivity();
  const hasValidatedRef = useRef(false);
  const wasOfflineRef = useRef(!connectivity.getOnline());

  const markHasLoggedIn = useCallback(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(AUTH_HAS_LOGGED_IN_KEY, "1");
  }, []);

  const validateSession = useCallback(async () => {
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (!currentSession) return;
    const { error } = await supabase.auth.getUser();
    if (isSessionMissingError(error)) {
      setSession(null);
      setAuthState(AuthState.SignedOut);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      setAuthState(initialSession ? AuthState.SignedIn : AuthState.SignedOut);
      if (initialSession) markHasLoggedIn();
      // Only validate session with server if online
      if (initialSession && connectivity.getOnline() && !hasValidatedRef.current) {
        hasValidatedRef.current = true;
        validateSession();
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setAuthState(newSession ? AuthState.SignedIn : AuthState.SignedOut);
      if (newSession) markHasLoggedIn();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [markHasLoggedIn, validateSession]);

  // Re-validate session only when coming back online from offline
  useEffect(() => {
    if (online && wasOfflineRef.current) {
      validateSession();
    }
    wasOfflineRef.current = !online;
  }, [online, validateSession]);

  const signUp = useCallback(
    async (
      email: string,
      password: string,
    ): Promise<{ success: boolean; password?: string }> => {
      setIsBusy(true);
      setError(null);
      try {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) {
          setError(formatAuthError(error));
          return { success: false };
        }
        // Check if email confirmation is required
        if (data.user && !data.session) {
          // User created but not confirmed yet
          setConfirmationEmail(email);
          setAuthState(AuthState.AwaitingConfirmation);
          return { success: true };
        }
        // User is confirmed and signed in (e.g., if email confirmation is disabled)
        return { success: true, password };
      } finally {
        setIsBusy(false);
      }
    },
    [],
  );

  const signIn = useCallback(
    async (
      email: string,
      password: string,
    ): Promise<{ success: boolean; password?: string }> => {
      setIsBusy(true);
      setError(null);
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) {
          setError(formatAuthError(error));
          return { success: false };
        }
        return { success: true, password };
      } finally {
        setIsBusy(false);
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    setIsBusy(true);
    setError(null);
    try {
      // Use 'local' scope to clear session even if server session is already invalid
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (isSessionMissingError(error)) {
        await supabase.auth.getUser();
        setSession(null);
        setAuthState(AuthState.SignedOut);
      }
    } finally {
      setIsBusy(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const backToSignIn = useCallback(() => {
    setConfirmationEmail(null);
    setAuthState(AuthState.SignedOut);
  }, []);

  return {
    session,
    user: session?.user ?? null,
    authState,
    error,
    isBusy,
    confirmationEmail,
    signUp,
    signIn,
    signOut,
    clearError,
    backToSignIn,
  };
}

export { AuthState };
