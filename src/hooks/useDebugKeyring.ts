import { useState, useEffect, useCallback } from "react";
import {
  deriveKEK,
  wrapDEK,
  unwrapDEK,
  generateSalt,
  encryptNote,
  decryptNote,
  type KeyringEntry,
} from "../crypto";
import { supabase } from "../lib/supabase";

export interface CloudKeyInfo {
  keyId: string;
  isPrimary: boolean;
}

type ActionStatus = "idle" | "busy" | "success" | "error";

export interface UseDebugKeyringReturn {
  cloudKeys: CloudKeyInfo[];
  rewrapStatus: ActionStatus;
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

async function fetchAllKeyringEntries(userId: string): Promise<KeyringEntry[]> {
  const { data, error } = await supabase
    .from("user_keyrings")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data as KeyringEntry[];
}

async function deleteKeyringEntry(userId: string, keyId: string): Promise<void> {
  await supabase
    .from("user_keyrings")
    .delete()
    .eq("user_id", userId)
    .eq("key_id", keyId);
}

export function useDebugKeyring(
  dek: CryptoKey | null,
  keyId: string | null,
  userId: string | null,
  isSignedIn: boolean,
): UseDebugKeyringReturn {
  const [cloudKeys, setCloudKeys] = useState<CloudKeyInfo[]>([]);
  const [rewrapStatus, setRewrapStatus] = useState<ActionStatus>("idle");
  const [rewrapError, setRewrapError] = useState<string | null>(null);
  const [cleanupStatus, setCleanupStatus] = useState<ActionStatus>("idle");
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);
  const [reencryptStatus, setReencryptStatus] = useState<ActionStatus>("idle");
  const [reencryptResult, setReencryptResult] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!isSignedIn || !userId) return;
    let cancelled = false;
    void fetchAllKeyringEntries(userId).then((entries) => {
      if (cancelled) return;
      setCloudKeys(
        entries.map((e) => ({ keyId: e.key_id, isPrimary: e.is_primary })),
      );
    });
    return () => { cancelled = true; };
  }, [isSignedIn, userId, refreshKey]);

  const rewrap = useCallback(async (password: string) => {
    if (!userId || !dek || !keyId) return;
    setRewrapStatus("busy");
    setRewrapError(null);
    try {
      const salt = generateSalt();
      const kek = await deriveKEK(password, salt);
      const wrapped = await wrapDEK(dek, kek);
      // Delete all existing entries, save single primary
      const entries = await fetchAllKeyringEntries(userId);
      for (const entry of entries) {
        await deleteKeyringEntry(userId, entry.key_id);
      }
      await supabase.from("user_keyrings").insert({
        user_id: userId,
        key_id: keyId,
        wrapped_dek: wrapped.data,
        dek_iv: wrapped.iv,
        kdf_salt: salt,
        kdf_iterations: 600_000,
        is_primary: true,
      });
      setRewrapStatus("success");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setRewrapStatus("error");
      setRewrapError(err instanceof Error ? err.message : "Rewrap failed");
    }
  }, [userId, dek, keyId]);

  const resetRewrapStatus = useCallback(() => {
    setRewrapStatus("idle");
    setRewrapError(null);
  }, []);

  const cleanup = useCallback(async () => {
    if (!userId || !keyId) return;
    setCleanupStatus("busy");
    setCleanupResult(null);
    try {
      const entries = await fetchAllKeyringEntries(userId);
      const toDelete = entries.filter((e) => e.key_id !== keyId);
      for (const entry of toDelete) {
        await deleteKeyringEntry(userId, entry.key_id);
      }
      setCleanupStatus("success");
      setCleanupResult(
        toDelete.length
          ? `Removed ${toDelete.length} unused key(s), kept primary`
          : `All ${entries.length} key(s) are in use`,
      );
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setCleanupStatus("error");
      setCleanupResult(err instanceof Error ? err.message : "Cleanup failed");
    }
  }, [userId, keyId]);

  const resetCleanupStatus = useCallback(() => {
    setCleanupStatus("idle");
    setCleanupResult(null);
  }, []);

  const reencrypt = useCallback(async (password: string) => {
    if (!userId || !keyId || !dek) return;
    setReencryptStatus("busy");
    setReencryptResult(null);
    try {
      // 1. Unwrap all cloud keys using password
      const entries = await fetchAllKeyringEntries(userId);
      const dekMap = new Map<string, CryptoKey>();
      dekMap.set(keyId, dek);
      for (const entry of entries) {
        if (dekMap.has(entry.key_id)) continue;
        try {
          const kek = await deriveKEK(password, entry.kdf_salt, entry.kdf_iterations);
          const unwrapped = await unwrapDEK(entry.wrapped_dek, entry.dek_iv, kek);
          dekMap.set(entry.key_id, unwrapped);
        } catch {
          // Skip keys that can't be unwrapped with this password
        }
      }

      // 2. Fetch all notes, re-encrypt non-primary ones
      const { data: notes, error } = await supabase
        .from("notes")
        .select("*")
        .eq("user_id", userId)
        .eq("deleted", false);
      if (error) throw error;

      let reencrypted = 0;
      for (const note of notes ?? []) {
        if (note.key_id === keyId) continue;
        const oldKey = dekMap.get(note.key_id);
        if (!oldKey) continue;

        const content = await decryptNote(
          { ciphertext: note.ciphertext, nonce: note.nonce },
          oldKey,
        );
        const encrypted = await encryptNote(content, dek, keyId);

        const { error: updateError } = await supabase.rpc("push_note", {
          p_id: note.id,
          p_user_id: userId,
          p_date: note.date,
          p_key_id: keyId,
          p_ciphertext: encrypted.ciphertext,
          p_nonce: encrypted.nonce,
          p_revision: note.revision,
          p_updated_at: new Date().toISOString(),
          p_deleted: false,
        });
        if (updateError) throw updateError;
        reencrypted++;
      }

      // 3. Delete non-primary keyring entries
      const toDelete = entries.filter((e) => e.key_id !== keyId);
      for (const entry of toDelete) {
        await deleteKeyringEntry(userId, entry.key_id);
      }

      // 4. Rewrap primary with password
      const salt = generateSalt();
      const kek = await deriveKEK(password, salt);
      const wrapped = await wrapDEK(dek, kek);
      await supabase.from("user_keyrings").upsert({
        user_id: userId,
        key_id: keyId,
        wrapped_dek: wrapped.data,
        dek_iv: wrapped.iv,
        kdf_salt: salt,
        kdf_iterations: 600_000,
        is_primary: true,
      });

      setReencryptStatus("success");
      setReencryptResult(
        `Re-encrypted ${reencrypted} note(s), removed ${toDelete.length} old key(s)`,
      );
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setReencryptStatus("error");
      setReencryptResult(err instanceof Error ? err.message : "Re-encrypt failed");
    }
  }, [userId, keyId, dek]);

  const resetReencryptStatus = useCallback(() => {
    setReencryptStatus("idle");
    setReencryptResult(null);
  }, []);

  return {
    cloudKeys,
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
