import { useState, useEffect, useCallback, useMemo } from "react";
import { fetchUserKeyring } from "../storage/userKeyring";
import { listLocalKeyIds } from "../storage/localKeyring";
import { rewrapCloudKeyring, cleanupUnusedKeys } from "../services/vaultService";
import { supabase } from "../lib/supabase";

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

  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyring identity change signals new keys
  const localKeyIds = useMemo(
    () => new Set(listLocalKeyIds()),
    [keyring],
  );

  useEffect(() => {
    if (!isSignedIn || !userId) return;
    let cancelled = false;
    void fetchUserKeyring(supabase, userId).then((entries) => {
      if (!cancelled) {
        setCloudKeyIds(new Set(entries.map((e) => e.keyId)));
      }
    });
    return () => { cancelled = true; };
  }, [isSignedIn, userId, keyring, rewrapStatus, cleanupStatus]);

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
      const result = await cleanupUnusedKeys({
        supabase,
        userId,
        activeKeyId,
      });
      setCleanupStatus("success");
      setCleanupResult(
        result.deleted.length
          ? `Removed ${result.deleted.length} unused cloud key(s), kept ${result.kept.length}`
          : `All ${result.kept.length} cloud key(s) are in use`,
      );
    } catch (err) {
      setCleanupStatus("error");
      setCleanupResult(err instanceof Error ? err.message : "Cleanup failed");
    }
  }, [userId, activeKeyId]);

  const resetCleanupStatus = useCallback(() => {
    setCleanupStatus("idle");
    setCleanupResult(null);
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
  };
}
