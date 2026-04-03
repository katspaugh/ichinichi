// @vitest-environment jsdom
import type { Mock } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { useAuth } from "../hooks/useAuth";
import { AuthState } from "../types";
import { supabase } from "../services/supabase";

vi.mock("../services/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
      })),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

vi.mock("../hooks/useConnectivity", () => ({
  useConnectivity: vi.fn(() => true),
}));

vi.mock("../services/connectivity", () => ({
  connectivity: {
    getOnline: vi.fn(() => true),
    subscribe: vi.fn(() => () => {}),
  },
}));

function createSession(overrides?: Partial<Session>): Session {
  return {
    access_token: "token",
    token_type: "bearer",
    expires_in: 3600,
    refresh_token: "refresh",
    user: {
      id: "user-id",
      aud: "authenticated",
      role: "authenticated",
      email: "test@example.com",
      app_metadata: {},
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
    ...overrides,
  } as Session;
}

function AuthHarness() {
  const auth = useAuth();
  return (
    <div>
      <div data-testid="auth-state">{auth.authState}</div>
      <button onClick={() => void auth.signIn("a@b.com", "password")}>Sign in</button>
      <button onClick={() => void auth.signOut()}>Sign out</button>
    </div>
  );
}

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates auth state to signed in after sign in when auth events are silent", async () => {
    (supabase.auth.getSession as Mock).mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });
    (supabase.auth.signInWithPassword as Mock).mockResolvedValueOnce({
      data: { session: createSession() },
      error: null,
    });

    render(<AuthHarness />);

    await waitFor(() => {
      expect(supabase.auth.getSession).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByTestId("auth-state").textContent).toBe(
        AuthState.SignedOut,
      );
    });

    fireEvent.click(screen.getByText("Sign in"));

    await waitFor(() => {
      expect(screen.getByTestId("auth-state").textContent).toBe(
        AuthState.SignedIn,
      );
    });
  });

  it("updates auth state to signed out after sign out when auth events are silent", async () => {
    (supabase.auth.getSession as Mock).mockResolvedValueOnce({
      data: { session: createSession() },
      error: null,
    });
    (supabase.auth.signOut as Mock).mockResolvedValueOnce({
      error: null,
    });

    render(<AuthHarness />);

    await waitFor(() => {
      expect(supabase.auth.getSession).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByTestId("auth-state").textContent).toBe(
        AuthState.SignedIn,
      );
    });

    fireEvent.click(screen.getByText("Sign out"));

    await waitFor(() => {
      expect(screen.getByTestId("auth-state").textContent).toBe(
        AuthState.SignedOut,
      );
    });
  });
});
