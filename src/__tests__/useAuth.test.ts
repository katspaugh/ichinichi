import { describe, it, expect } from "vitest";
import { authReducer, Phase, type AuthContext } from "../hooks/useAuth";
import { AuthState } from "../types";

const makeInitialState = (overrides?: Partial<AuthContext>): AuthContext => ({
  phase: Phase.Idle,
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
  // ─── Bootstrap ──────────────────────────────────────────────────────────

  it("BOOTSTRAP_SESSION with session → RestoringDek", () => {
    const state = makeInitialState({ phase: Phase.Bootstrapping, authState: AuthState.Loading });
    const next = authReducer(state, { type: "BOOTSTRAP_SESSION", session: fakeSession });
    expect(next.phase).toBe(Phase.RestoringDek);
    expect(next.authState).toBe(AuthState.SignedIn);
    expect(next.session).toBe(fakeSession);
  });

  it("BOOTSTRAP_SESSION with null → Idle + SignedOut", () => {
    const state = makeInitialState({ phase: Phase.Bootstrapping, authState: AuthState.Loading });
    const next = authReducer(state, { type: "BOOTSTRAP_SESSION", session: null });
    expect(next.phase).toBe(Phase.Idle);
    expect(next.authState).toBe(AuthState.SignedOut);
  });

  // ─── Sign in ────────────────────────────────────────────────────────────

  it("SIGN_IN from Idle → SigningIn, isBusy true", () => {
    const state = makeInitialState();
    const next = authReducer(state, { type: "SIGN_IN", email: "a@b.com", password: "pass" });
    expect(next.phase).toBe(Phase.SigningIn);
    expect(next.isBusy).toBe(true);
    expect(next.signInInput).toEqual({ email: "a@b.com", password: "pass" });
    expect(next.error).toBeNull();
  });

  it("SIGN_IN ignored when not Idle", () => {
    const state = makeInitialState({ phase: Phase.SigningIn });
    const next = authReducer(state, { type: "SIGN_IN", email: "a@b.com", password: "p" });
    expect(next).toBe(state);
  });

  it("PHASE_DONE for SigningIn → auto-transition to UnlockingDek", () => {
    const state = makeInitialState({
      phase: Phase.SigningIn,
      isBusy: true,
      signInInput: { email: "a@b.com", password: "secret" },
    });
    const next = authReducer(state, { type: "PHASE_DONE", phase: Phase.SigningIn, session: fakeSession });
    expect(next.phase).toBe(Phase.UnlockingDek);
    expect(next.dekInput).toEqual({ password: "secret" });
    expect(next.signInInput).toBeNull();
    expect(next.session).toBe(fakeSession);
    expect(next.authState).toBe(AuthState.SignedIn);
  });

  // ─── Sign up ────────────────────────────────────────────────────────────

  it("SIGN_UP from Idle → SigningUp, isBusy true", () => {
    const state = makeInitialState();
    const next = authReducer(state, { type: "SIGN_UP", email: "a@b.com", password: "pass" });
    expect(next.phase).toBe(Phase.SigningUp);
    expect(next.isBusy).toBe(true);
    expect(next.signUpInput).toEqual({ email: "a@b.com", password: "pass" });
  });

  it("PHASE_DONE for SigningUp → auto-transition to GeneratingDek", () => {
    const state = makeInitialState({
      phase: Phase.SigningUp,
      isBusy: true,
      signUpInput: { email: "a@b.com", password: "secret" },
    });
    const next = authReducer(state, { type: "PHASE_DONE", phase: Phase.SigningUp, session: fakeSession });
    expect(next.phase).toBe(Phase.GeneratingDek);
    expect(next.dekInput).toEqual({ password: "secret" });
    expect(next.signUpInput).toBeNull();
    expect(next.authState).toBe(AuthState.SignedIn);
  });

  // ─── DEK operations ────────────────────────────────────────────────────

  it("PHASE_DONE for UnlockingDek → stores dek + keyId, Idle", () => {
    const state = makeInitialState({
      phase: Phase.UnlockingDek,
      isBusy: true,
      dekInput: { password: "pass" },
      session: fakeSession,
    });
    const next = authReducer(state, { type: "PHASE_DONE", phase: Phase.UnlockingDek, dek: fakeDek, keyId: "key-1" });
    expect(next.phase).toBe(Phase.Idle);
    expect(next.dek).toBe(fakeDek);
    expect(next.keyId).toBe("key-1");
    expect(next.dekInput).toBeNull();
    expect(next.isBusy).toBe(false);
  });

  it("PHASE_DONE for RestoringDek without dek → Idle, dek null (manual unlock needed)", () => {
    const state = makeInitialState({
      phase: Phase.RestoringDek,
      session: fakeSession,
      authState: AuthState.SignedIn,
    });
    const next = authReducer(state, { type: "PHASE_DONE", phase: Phase.RestoringDek });
    expect(next.phase).toBe(Phase.Idle);
    expect(next.dek).toBeNull();
  });

  it("PHASE_DONE for RestoringDek with dek → Idle, dek set", () => {
    const state = makeInitialState({
      phase: Phase.RestoringDek,
      session: fakeSession,
      authState: AuthState.SignedIn,
    });
    const next = authReducer(state, { type: "PHASE_DONE", phase: Phase.RestoringDek, dek: fakeDek, keyId: "key-1" });
    expect(next.phase).toBe(Phase.Idle);
    expect(next.dek).toBe(fakeDek);
    expect(next.keyId).toBe("key-1");
  });

  it("UNLOCK_DEK → UnlockingDek with dekInput when Idle + session", () => {
    const state = makeInitialState({
      session: fakeSession,
      authState: AuthState.SignedIn,
    });
    const next = authReducer(state, { type: "UNLOCK_DEK", password: "mypass" });
    expect(next.phase).toBe(Phase.UnlockingDek);
    expect(next.dekInput).toEqual({ password: "mypass" });
    expect(next.isBusy).toBe(true);
  });

  it("UNLOCK_DEK ignored when no session", () => {
    const state = makeInitialState();
    const next = authReducer(state, { type: "UNLOCK_DEK", password: "mypass" });
    expect(next).toBe(state);
  });

  // ─── Sign out ───────────────────────────────────────────────────────────

  it("SIGN_OUT from Idle → SigningOut, isBusy true", () => {
    const state = makeInitialState();
    const next = authReducer(state, { type: "SIGN_OUT" });
    expect(next.phase).toBe(Phase.SigningOut);
    expect(next.isBusy).toBe(true);
  });

  it("PHASE_DONE for SigningOut → Idle, clears all state", () => {
    const state = makeInitialState({
      phase: Phase.SigningOut,
      session: fakeSession,
      authState: AuthState.SignedIn,
      dek: fakeDek,
      keyId: "key-1",
      isBusy: true,
    });
    const next = authReducer(state, { type: "PHASE_DONE", phase: Phase.SigningOut });
    expect(next.phase).toBe(Phase.Idle);
    expect(next.isBusy).toBe(false);
    expect(next.session).toBeNull();
    expect(next.authState).toBe(AuthState.SignedOut);
    expect(next.dek).toBeNull();
    expect(next.keyId).toBeNull();
  });

  // ─── Errors ─────────────────────────────────────────────────────────────

  it("PHASE_ERROR during SigningIn → Idle", () => {
    const state = makeInitialState({ phase: Phase.SigningIn, isBusy: true });
    const next = authReducer(state, { type: "PHASE_ERROR", message: "bad" });
    expect(next.phase).toBe(Phase.Idle);
    expect(next.isBusy).toBe(false);
    expect(next.error).toBe("bad");
  });

  it("PHASE_ERROR during Bootstrapping keeps phase", () => {
    const state = makeInitialState({ phase: Phase.Bootstrapping });
    const next = authReducer(state, { type: "PHASE_ERROR", message: "oops" });
    expect(next.phase).toBe(Phase.Bootstrapping);
    expect(next.error).toBe("oops");
  });

  // ─── Phase mismatch guard ──────────────────────────────────────────────

  it("PHASE_DONE ignored when phase doesn't match", () => {
    const state = makeInitialState({ phase: Phase.Idle });
    const next = authReducer(state, { type: "PHASE_DONE", phase: Phase.SigningIn, session: fakeSession });
    expect(next).toBe(state);
  });
});
