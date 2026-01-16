import { useCallback, useEffect, useRef } from "react";
import { useMachine } from "@xstate/react";
import { assign, fromCallback, setup } from "xstate";
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

type AuthEvent =
  | { type: "SESSION_CHANGED"; session: Session | null }
  | { type: "SESSION_VALIDATED"; session: Session | null }
  | { type: "INPUTS_CHANGED"; online: boolean }
  | { type: "SIGN_IN"; email: string; password: string }
  | { type: "SIGN_UP"; email: string; password: string }
  | { type: "SIGN_OUT" }
  | { type: "AUTH_ERROR"; message: string }
  | { type: "CLEAR_ERROR" }
  | { type: "BACK_TO_SIGN_IN" }
  | { type: "SET_CONFIRMATION_EMAIL"; email: string | null };

interface AuthContext {
  session: Session | null;
  authState: AuthState;
  error: string | null;
  isBusy: boolean;
  confirmationEmail: string | null;
  online: boolean;
}

const authBootstrap = fromCallback(
  ({ sendBack }: { sendBack: (event: AuthEvent) => void }) => {
    let cancelled = false;

    const start = async () => {
      const {
        data: { session: initialSession },
      } = await supabase.auth.getSession();
      if (!cancelled) {
        sendBack({ type: "SESSION_CHANGED", session: initialSession });
      }
    };

    void start();

    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      sendBack({ type: "SESSION_CHANGED", session: newSession });
    });

    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  },
);

const sessionValidator = fromCallback(
  ({
    sendBack,
    input,
  }: {
    sendBack: (event: AuthEvent) => void;
    input: { online: boolean };
  }) => {
    let cancelled = false;

    const validate = async () => {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();
      if (!currentSession) {
        if (!cancelled) {
          sendBack({ type: "SESSION_VALIDATED", session: null });
        }
        return;
      }
      const { error } = await supabase.auth.getUser();
      if (!cancelled) {
        if (isSessionMissingError(error)) {
          sendBack({ type: "SESSION_VALIDATED", session: null });
        } else {
          sendBack({ type: "SESSION_VALIDATED", session: currentSession });
        }
      }
    };

    if (input.online) {
      void validate();
    }

    return () => {
      cancelled = true;
    };
  },
);

const signInActor = fromCallback(
  ({
    sendBack,
    input,
  }: {
    sendBack: (event: AuthEvent) => void;
    input: { email: string; password: string };
  }) => {
    let cancelled = false;

    const run = async () => {
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email: input.email,
          password: input.password,
        });
        if (!cancelled && error) {
          sendBack({ type: "AUTH_ERROR", message: formatAuthError(error) });
        }
        if (!cancelled && !error) {
          sendBack({ type: "SESSION_VALIDATED", session: null });
        }
      } catch (error) {
        if (!cancelled) {
          sendBack({
            type: "AUTH_ERROR",
            message:
              error instanceof Error ? error.message : "Unable to sign in.",
          });
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  },
);

const signUpActor = fromCallback(
  ({
    sendBack,
    input,
  }: {
    sendBack: (event: AuthEvent) => void;
    input: { email: string; password: string };
  }) => {
    let cancelled = false;

    const run = async () => {
      try {
        const { data, error } = await supabase.auth.signUp({
          email: input.email,
          password: input.password,
        });
        if (!cancelled && error) {
          sendBack({ type: "AUTH_ERROR", message: formatAuthError(error) });
          return;
        }
        if (!cancelled) {
          if (data.user && !data.session) {
            sendBack({ type: "SET_CONFIRMATION_EMAIL", email: input.email });
            sendBack({ type: "SESSION_CHANGED", session: null });
          } else {
            sendBack({ type: "SET_CONFIRMATION_EMAIL", email: null });
          }
        }
      } catch (error) {
        if (!cancelled) {
          sendBack({
            type: "AUTH_ERROR",
            message:
              error instanceof Error ? error.message : "Unable to sign up.",
          });
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  },
);

const signOutActor = fromCallback(
  ({ sendBack }: { sendBack: (event: AuthEvent) => void }) => {
    let cancelled = false;

    const run = async () => {
      try {
        const { error } = await supabase.auth.signOut({ scope: "local" });
        if (isSessionMissingError(error)) {
          await supabase.auth.getUser();
          if (!cancelled) {
            sendBack({ type: "SESSION_CHANGED", session: null });
          }
        }
      } finally {
        if (!cancelled) {
          sendBack({ type: "SIGN_OUT" });
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  },
);

const authMachine = setup({
  types: {
    context: {} as AuthContext,
    events: {} as AuthEvent,
  },
  actors: {
    authBootstrap,
    sessionValidator,
    signInActor,
    signUpActor,
    signOutActor,
  },
  actions: {
    applySession: assign((args: { event: AuthEvent }) => {
      const { event } = args;
      if (
        event.type !== "SESSION_CHANGED" &&
        event.type !== "SESSION_VALIDATED"
      ) {
        return {};
      }
      return {
        session: event.session,
        authState: event.session ? AuthState.SignedIn : AuthState.SignedOut,
      };
    }),
    applyOnline: assign((args: { event: AuthEvent }) => {
      const { event } = args;
      if (event.type !== "INPUTS_CHANGED") {
        return {};
      }
      return { online: event.online };
    }),
    setBusy: assign({ isBusy: true }),
    clearBusy: assign({ isBusy: false }),
    clearError: assign({ error: null }),
    setErrorMessage: assign((args: { event: AuthEvent }) => {
      const { event } = args;
      if (event.type !== "AUTH_ERROR") {
        return {};
      }
      return { error: event.message };
    }),
    setAwaitingConfirmation: assign({
      authState: AuthState.AwaitingConfirmation,
    }),
    setConfirmationEmail: assign((args: { event: AuthEvent }) => {
      const { event } = args;
      if (event.type !== "SET_CONFIRMATION_EMAIL") {
        return {};
      }
      return { confirmationEmail: event.email };
    }),
    markHasLoggedIn: () => {
      if (typeof window === "undefined") return;
      localStorage.setItem(AUTH_HAS_LOGGED_IN_KEY, "1");
    },
  },
}).createMachine({
  id: "auth",
  initial: "bootstrapping",
  context: {
    session: null,
    authState: AuthState.Loading,
    error: null,
    isBusy: false,
    confirmationEmail: null,
    online: connectivity.getOnline(),
  },
  invoke: {
    id: "bootstrap",
    src: "authBootstrap",
  },
  on: {
    SESSION_CHANGED: {
      actions: ["applySession", "markHasLoggedIn"],
    },
    SESSION_VALIDATED: {
      actions: "applySession",
    },
    INPUTS_CHANGED: {
      actions: "applyOnline",
    },
    AUTH_ERROR: {
      actions: ["setErrorMessage", "clearBusy"],
    },
    SET_CONFIRMATION_EMAIL: {
      actions: "setConfirmationEmail",
    },
  },
  states: {
    bootstrapping: {
      on: {
        SESSION_CHANGED: {
          target: "idle",
        },
      },
    },
    idle: {
      on: {
        SIGN_IN: {
          target: "signingIn",
          actions: ["clearError", "setBusy"],
        },
        SIGN_UP: {
          target: "signingUp",
          actions: ["clearError", "setBusy"],
        },
        SIGN_OUT: {
          target: "signingOut",
          actions: ["clearError", "setBusy"],
        },
        BACK_TO_SIGN_IN: {
          actions: [
            "setConfirmationEmail",
            "clearError",
            "setAwaitingConfirmation",
          ],
        },
        SESSION_CHANGED: {
          actions: "applySession",
        },
        INPUTS_CHANGED: {
          actions: "applyOnline",
        },
      },
    },
    signingIn: {
      invoke: {
        id: "signIn",
        src: "signInActor",
        input: ({ event }: { event: AuthEvent }) => {
          if (event.type !== "SIGN_IN") {
            return { email: "", password: "" };
          }
          return { email: event.email, password: event.password };
        },
      },
      on: {
        SIGN_IN: {
          target: "idle",
          actions: "clearBusy",
        },
        SESSION_CHANGED: {
          target: "idle",
          actions: "clearBusy",
        },
        AUTH_ERROR: {
          target: "idle",
          actions: ["setErrorMessage", "clearBusy"],
        },
      },
    },
    signingUp: {
      invoke: {
        id: "signUp",
        src: "signUpActor",
        input: ({ event }: { event: AuthEvent }) => {
          if (event.type !== "SIGN_UP") {
            return { email: "", password: "" };
          }
          return { email: event.email, password: event.password };
        },
      },
      on: {
        SET_CONFIRMATION_EMAIL: {
          actions: ["setConfirmationEmail", "setAwaitingConfirmation"],
        },
        SESSION_CHANGED: {
          target: "idle",
          actions: "clearBusy",
        },
        AUTH_ERROR: {
          target: "idle",
          actions: ["setErrorMessage", "clearBusy"],
        },
      },
    },
    signingOut: {
      invoke: {
        id: "signOut",
        src: "signOutActor",
      },
      on: {
        SIGN_OUT: {
          target: "idle",
          actions: "clearBusy",
        },
        SESSION_CHANGED: {
          target: "idle",
          actions: "clearBusy",
        },
      },
    },
  },
});

export function useAuth(): UseAuthReturn {
  const online = useConnectivity();
  const onlineRef = useRef(online);
  const [state, send] = useMachine(authMachine);

  useEffect(() => {
    onlineRef.current = online;
  }, [online]);

  useEffect(() => {
    send({ type: "INPUTS_CHANGED", online });
  }, [send, online]);

  useEffect(() => {
    if (online && !onlineRef.current) {
      send({ type: "INPUTS_CHANGED", online });
    }
  }, [online, send]);

  useEffect(() => {
    if (state.context.session && online && !state.context.isBusy) {
      send({ type: "SESSION_VALIDATED", session: state.context.session });
    }
  }, [state.context.session, state.context.isBusy, online, send]);

  const signUp = useCallback(
    async (email: string, password: string) => {
      send({ type: "SIGN_UP", email, password });
      return { success: true, password };
    },
    [send],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      send({ type: "SIGN_IN", email, password });
      return { success: true, password };
    },
    [send],
  );

  const signOut = useCallback(async () => {
    send({ type: "SIGN_OUT" });
  }, [send]);

  const clearError = useCallback(() => {
    send({ type: "CLEAR_ERROR" });
  }, [send]);

  const backToSignIn = useCallback(() => {
    send({ type: "BACK_TO_SIGN_IN" });
  }, [send]);

  return {
    session: state.context.session,
    user: state.context.session?.user ?? null,
    authState: state.context.authState,
    error: state.context.error,
    isBusy: state.context.isBusy,
    confirmationEmail: state.context.confirmationEmail,
    signUp,
    signIn,
    signOut,
    clearError,
    backToSignIn,
  };
}
