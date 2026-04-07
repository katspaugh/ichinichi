import { useState, useEffect, useCallback, useMemo } from "react";
import { fetchUserKeyring } from "../storage/userKeyring";
import { listLocalKeyIds } from "../storage/localKeyring";
import { rewrapCloudKeyring, cleanupUnusedKeys, reencryptCloudNotes } from "../services/vaultService";
import { supabase } from "../services/supabase";

export interface DebugKeyInfo {
  keyId: string;
  inLocal: boolean;
  inCloud: boolean;
  isPrimary: boolean;
}

type ActionStatus = "idle" | "busy" | "success" | "error";

export interface UseDebugKeyringReturn {
  keys: DebugKeyInfo[];
  rewrapStatus: "idle" | "rewrapping" | "success" | "error";
  rewrapError: string | null;
  rewrap: (password: string) => Promise<void>;
  resetRewrapStatus: () => void;
  cleanupStatus: ActionStatus;
  cleanupResult: string | null;
  cleanup: () => Promise<void>;
  resetCleanupStatus: () => void;
  reencryptStatus: ActionStatus;
  reencryptResult: string | null;
  reencrypt: (password: string) => Promise<void>;
  resetReencryptStatus: () => void;
}

export function useDebugKeyring(
  keyring: Map<string, CryptoKey>,
  activeKeyId: string | null,
  userId: string | null,
  isSignedIn: boolean,
): UseDebugKeyringReturn {
  const [cloudKeyIds, setCloudKeyIds] = useState<Set<string>>(new Set());
  const [rewrapStatus, setRewrapStatus] = useState<
    "idle" | "rewrapping" | "success" | "error"
  >("idle");
  const [rewrapError, setRewrapError] = useState<string | null>(null);
  const [cleanupStatus, setCleanupStatus] = useState<ActionStatus>("idle");
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);
  const [reencryptStatus, setReencryptStatus] = useState<ActionStatus>("idle");
  const [reencryptResult, setReencryptResult] = useState<string | null>(null);

  const localKeyIds = useMemo(
    () => new Set(listLocalKeyIds()),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyring identity change signals new keys
    [keyring],
  );

  // Track keyring size to avoid re-fetching when the Map reference changes
  // but the number of keys hasn't (common during renders).
  const keyringSize = keyring.size;

  useEffect(() => {
    if (!isSignedIn || !userId) return;
    let cancelled = false;
    void fetchUserKeyring(supabase, userId).then((entries) => {
      if (!cancelled) {
        setCloudKeyIds(new Set(entries.map((e) => e.keyId)));
      }
    });
    return () => { cancelled = true; };
  }, [isSignedIn, userId, keyringSize, rewrapStatus, cleanupStatus]);

  const keys = useMemo(() => {
    const result: DebugKeyInfo[] = [];
    for (const [keyId] of keyring.entries()) {
      if (keyId === "legacy") continue;
      result.push({
        keyId,
        inLocal: localKeyIds.has(keyId),
        inCloud: cloudKeyIds.has(keyId),
        isPrimary: keyId === activeKeyId,
      });
    }
    return result;
  }, [keyring, localKeyIds, cloudKeyIds, activeKeyId]);

  const rewrap = useCallback(async (password: string) => {
    if (!userId) return;
    setRewrapStatus("rewrapping");
    setRewrapError(null);
    try {
      const keysToSync = new Map<string, CryptoKey>();
      for (const [keyId, key] of keyring.entries()) {
        if (keyId !== "legacy") keysToSync.set(keyId, key);
      }
      await rewrapCloudKeyring({
        supabase,
        userId,
        newPassword: password,
        keyring: keysToSync,
        primaryKeyId: activeKeyId,
      });
      setRewrapStatus("success");
    } catch (err) {
      setRewrapStatus("error");
      setRewrapError(err instanceof Error ? err.message : "Rewrap failed");
    }
  }, [userId, keyring, activeKeyId]);

  const resetRewrapStatus = useCallback(() => {
    setRewrapStatus("idle");
    setRewrapError(null);
  }, []);

  const cleanup = useCallback(async () => {
    if (!userId) return;
    setCleanupStatus("busy");
    setCleanupResult(null);
    try {
      const keysToSync = new Map<string, CryptoKey>();
      for (const [keyId, key] of keyring.entries()) {
        if (keyId !== "legacy") keysToSync.set(keyId, key);
      }
      const result = await cleanupUnusedKeys({
        supabase,
        userId,
        activeKeyId,
        keyring: keysToSync,
      });
      const parts: string[] = [];
      if (result.reencrypted) parts.push(`re-encrypted ${result.reencrypted} note(s)`);
      if (result.deleted.length) parts.push(`removed ${result.deleted.length} key(s)`);
      if (!parts.length) parts.push(`all ${result.kept.length} cloud key(s) are in use`);
      setCleanupStatus("success");
      setCleanupResult(parts.join(", "));
    } catch (err) {
      setCleanupStatus("error");
      setCleanupResult(err instanceof Error ? err.message : "Cleanup failed");
    }
  }, [userId, activeKeyId, keyring]);

  const resetCleanupStatus = useCallback(() => {
    setCleanupStatus("idle");
    setCleanupResult(null);
  }, []);

  const reencrypt = useCallback(async (password: string) => {
    if (!userId || !activeKeyId) return;
    setReencryptStatus("busy");
    setReencryptResult(null);
    try {
      const keysToSync = new Map<string, CryptoKey>();
      for (const [keyId, key] of keyring.entries()) {
        if (keyId !== "legacy") keysToSync.set(keyId, key);
      }
      const result = await reencryptCloudNotes({
        supabase,
        userId,
        password,
        keyring: keysToSync,
        primaryKeyId: activeKeyId,
      });
      setReencryptStatus("success");
      setReencryptResult(
        `Re-encrypted ${result.reencrypted} note(s), removed ${result.deleted.length} old key(s)`,
      );
    } catch (err) {
      setReencryptStatus("error");
      setReencryptResult(err instanceof Error ? err.message : "Re-encrypt failed");
    }
  }, [userId, keyring, activeKeyId]);

  const resetReencryptStatus = useCallback(() => {
    setReencryptStatus("idle");
    setReencryptResult(null);
  }, []);

  return {
    keys,
    rewrapStatus,
    rewrapError,
    rewrap,
    resetRewrapStatus,
    cleanupStatus,
    cleanupResult,
    cleanup,
    resetCleanupStatus,
    reencryptStatus,
    reencryptResult,
    reencrypt,
    resetReencryptStatus,
  };
}
