import { describe, it, expect } from "vitest";
import { authReducer, type AuthContext } from "../hooks/useAuth";
import { AuthState } from "../types";

const makeInitialState = (overrides?: Partial<AuthContext>): AuthContext => ({
  phase: "idle",
  session: null,
  authState: AuthState.SignedOut,
  error: null,
  isBusy: false,
  online: true,
  signInInput: null,
  signUpInput: null,
  dekInput: null,
  dek: null,
  keyId: null,
  isPasswordRecovery: false,
  hashError: null,
  ...overrides,
});

const fakeSession = {
  user: { id: "user-1", email: "test@test.com" },
  access_token: "token",
  refresh_token: "refresh",
} as unknown as import("@supabase/supabase-js").Session;

const fakeDek = {} as CryptoKey;

describe("authReducer", () => {
  it("SIGN_IN from idle → signingIn, isBusy true, signInInput set", () => {
    const state = makeInitialState();
    const next = authReducer(state, { type: "SIGN_IN", email: "a@b.com", password: "pass" });
    expect(next.phase).toBe("signingIn");
    expect(next.isBusy).toBe(true);
    expect(next.signInInput).toEqual({ email: "a@b.com", password: "pass" });
    expect(next.error).toBeNull();
  });

  it("SIGN_UP from idle → signingUp, isBusy true, signUpInput set", () => {
    const state = makeInitialState();
    const next = authReducer(state, { type: "SIGN_UP", email: "a@b.com", password: "pass" });
    expect(next.phase).toBe("signingUp");
    expect(next.isBusy).toBe(true);
    expect(next.signUpInput).toEqual({ email: "a@b.com", password: "pass" });
  });

  it("SESSION_CHANGED with session during signingIn → unlockingDek, dekInput set from signInInput", () => {
    const state = makeInitialState({
      phase: "signingIn",
      isBusy: true,
      signInInput: { email: "a@b.com", password: "secret" },
    });
    const next = authReducer(state, { type: "SESSION_CHANGED", session: fakeSession });
    expect(next.phase).toBe("unlockingDek");
    expect(next.dekInput).toEqual({ password: "secret" });
    expect(next.signInInput).toBeNull();
    expect(next.session).toBe(fakeSession);
    expect(next.authState).toBe(AuthState.SignedIn);
  });

  it("SESSION_CHANGED with session during signingUp → generatingDek, dekInput set from signUpInput", () => {
    const state = makeInitialState({
      phase: "signingUp",
      isBusy: true,
      signUpInput: { email: "a@b.com", password: "secret" },
    });
    const next = authReducer(state, { type: "SESSION_CHANGED", session: fakeSession });
    expect(next.phase).toBe("generatingDek");
    expect(next.dekInput).toEqual({ password: "secret" });
    expect(next.signUpInput).toBeNull();
    expect(next.session).toBe(fakeSession);
    expect(next.authState).toBe(AuthState.SignedIn);
  });

  it("DEK_UNLOCKED → stores dek + keyId, idle, isBusy false", () => {
    const state = makeInitialState({
      phase: "unlockingDek",
      isBusy: true,
      dekInput: { password: "pass" },
      session: fakeSession,
    });
    const next = authReducer(state, { type: "DEK_UNLOCKED", dek: fakeDek, keyId: "key-1" });
    expect(next.phase).toBe("idle");
    expect(next.dek).toBe(fakeDek);
    expect(next.keyId).toBe("key-1");
    expect(next.dekInput).toBeNull();
    expect(next.isBusy).toBe(false);
  });

  it("DEK_ERROR → stores error, idle, clears dekInput", () => {
    const state = makeInitialState({
      phase: "unlockingDek",
      isBusy: true,
      dekInput: { password: "pass" },
      session: fakeSession,
    });
    const next = authReducer(state, { type: "DEK_ERROR", message: "No encryption key found" });
    expect(next.phase).toBe("idle");
    expect(next.error).toBe("No encryption key found");
    expect(next.dekInput).toBeNull();
    expect(next.isBusy).toBe(false);
  });

  it("SESSION_CHANGED with null → clears dek + keyId + dekInput", () => {
    const state = makeInitialState({
      phase: "idle",
      session: fakeSession,
      authState: AuthState.SignedIn,
      dek: fakeDek,
      keyId: "key-1",
      dekInput: { password: "pass" },
    });
    const next = authReducer(state, { type: "SESSION_CHANGED", session: null });
    expect(next.dek).toBeNull();
    expect(next.keyId).toBeNull();
    expect(next.dekInput).toBeNull();
    expect(next.authState).toBe(AuthState.SignedOut);
    expect(next.session).toBeNull();
  });

  it("SIGN_OUT from idle → signingOut, isBusy true", () => {
    const state = makeInitialState();
    const next = authReducer(state, { type: "SIGN_OUT" });
    expect(next.phase).toBe("signingOut");
    expect(next.isBusy).toBe(true);
    expect(next.error).toBeNull();
  });

  it("UNLOCK_DEK → unlockingDek with dekInput when idle + session", () => {
    const state = makeInitialState({
      session: fakeSession,
      authState: AuthState.SignedIn,
    });
    const next = authReducer(state, { type: "UNLOCK_DEK", password: "mypass" });
    expect(next.phase).toBe("unlockingDek");
    expect(next.dekInput).toEqual({ password: "mypass" });
    expect(next.isBusy).toBe(true);
    expect(next.error).toBeNull();
  });

  it("UNLOCK_DEK ignored when no session", () => {
    const state = makeInitialState();
    const next = authReducer(state, { type: "UNLOCK_DEK", password: "mypass" });
    expect(next).toBe(state);
  });

  it("SIGN_IN ignored when not idle", () => {
    const state = makeInitialState({ phase: "signingIn" });
    const next = authReducer(state, { type: "SIGN_IN", email: "a@b.com", password: "p" });
    expect(next).toBe(state);
  });

  it("AUTH_ERROR during bootstrapping keeps phase", () => {
    const state = makeInitialState({ phase: "bootstrapping" });
    const next = authReducer(state, { type: "AUTH_ERROR", message: "oops" });
    expect(next.phase).toBe("bootstrapping");
    expect(next.error).toBe("oops");
  });

  it("AUTH_ERROR during signingIn → idle", () => {
    const state = makeInitialState({ phase: "signingIn", isBusy: true });
    const next = authReducer(state, { type: "AUTH_ERROR", message: "bad" });
    expect(next.phase).toBe("idle");
    expect(next.isBusy).toBe(false);
    expect(next.error).toBe("bad");
  });

  it("SESSION_CHANGED during bootstrapping → restoringDek", () => {
    const state = makeInitialState({
      phase: "bootstrapping",
      authState: AuthState.Loading,
    });
    const next = authReducer(state, { type: "SESSION_CHANGED", session: fakeSession });
    expect(next.phase).toBe("restoringDek");
    expect(next.authState).toBe(AuthState.SignedIn);
    expect(next.dek).toBeNull(); // DEK restored by effect
  });

  it("SESSION_CHANGED during DEK phases is ignored (no disruption)", () => {
    for (const phase of ["restoringDek", "unlockingDek", "generatingDek"] as const) {
      const state = makeInitialState({
        phase,
        authState: AuthState.SignedIn,
        session: fakeSession,
      });
      const next = authReducer(state, { type: "SESSION_CHANGED", session: fakeSession });
      expect(next).toBe(state); // same reference — no re-render
    }
  });
});
