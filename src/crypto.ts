import { sanitizeHtml } from "./utils/sanitize";
import type { SupabaseClient } from "./lib/supabase";

// ─── Encoding helpers ────────────────────────────────────────────────────────

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes as Uint8Array<ArrayBuffer>;
}

// ─── Key management ──────────────────────────────────────────────────────────

export function generateSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return bytesToBase64(bytes);
}

export async function deriveKEK(
  password: string,
  saltBase64: string,
  iterations = 600_000,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: base64ToBytes(saltBase64),
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["wrapKey", "unwrapKey"],
  );
}

export async function generateDEK(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function wrapDEK(
  dek: CryptoKey,
  kek: CryptoKey,
): Promise<{ iv: string; data: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.wrapKey("raw", dek, kek, {
    name: "AES-GCM",
    iv,
  });
  return {
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(wrapped)),
  };
}

export async function unwrapDEK(
  wrappedData: string,
  iv: string,
  kek: CryptoKey,
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    "raw",
    base64ToBytes(wrappedData),
    kek,
    { name: "AES-GCM", iv: base64ToBytes(iv) },
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function computeKeyId(dek: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", dek);
  const hash = await crypto.subtle.digest("SHA-256", raw);
  return bytesToBase64(new Uint8Array(hash));
}

// ─── Note encryption ─────────────────────────────────────────────────────────

export interface EncryptedNote {
  ciphertext: string;
  nonce: string;
  keyId: string;
}

export async function encryptNote(
  content: string,
  dek: CryptoKey,
  keyId: string,
): Promise<EncryptedNote> {
  const sanitized = sanitizeHtml(content);
  const envelope = JSON.stringify({ content: sanitized });
  const plaintext = new TextEncoder().encode(envelope);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const cipherbuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    dek,
    plaintext,
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(cipherbuf)),
    nonce: bytesToBase64(nonce),
    keyId,
  };
}

export async function decryptNote(
  record: { ciphertext: string; nonce: string },
  dek: CryptoKey,
): Promise<string> {
  const plainbuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(record.nonce) },
    dek,
    base64ToBytes(record.ciphertext),
  );
  const envelope = JSON.parse(new TextDecoder().decode(plainbuf)) as {
    content: string;
  };
  return envelope.content;
}

// ─── Image encryption ────────────────────────────────────────────────────────

export interface EncryptedImage {
  ciphertext: string;
  nonce: string;
  keyId: string;
  sha256: string;
}

async function deriveImageSubkey(dek: CryptoKey): Promise<CryptoKey> {
  const dekRaw = await crypto.subtle.exportKey("raw", dek);
  const hkdfKey = await crypto.subtle.importKey("raw", dekRaw, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode("ichinichi-image-key"),
    },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptImage(
  blob: Blob,
  dek: CryptoKey,
  keyId: string,
): Promise<EncryptedImage> {
  const data = await blob.arrayBuffer();
  const sha256buf = await crypto.subtle.digest("SHA-256", data);
  const sha256 = bytesToBase64(new Uint8Array(sha256buf));

  const imageKey = await deriveImageSubkey(dek);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const cipherbuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    imageKey,
    data,
  );

  return {
    ciphertext: bytesToBase64(new Uint8Array(cipherbuf)),
    nonce: bytesToBase64(nonce),
    keyId,
    sha256,
  };
}

export async function decryptImage(
  record: { ciphertext: string; nonce: string },
  dek: CryptoKey,
  mimeType: string,
): Promise<Blob> {
  const imageKey = await deriveImageSubkey(dek);
  const plainbuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(record.nonce) },
    imageKey,
    base64ToBytes(record.ciphertext),
  );
  return new Blob([plainbuf], { type: mimeType });
}

// ─── Supabase keyring ────────────────────────────────────────────────────────

export interface KeyringEntry {
  key_id: string;
  wrapped_dek: string;
  dek_iv: string;
  kdf_salt: string;
  kdf_iterations: number;
  is_primary: boolean;
}

export async function fetchKeyring(
  supabase: SupabaseClient,
  userId: string,
): Promise<KeyringEntry | null> {
  const { data, error } = await supabase
    .from("user_keyrings")
    .select("*")
    .eq("user_id", userId)
    .eq("is_primary", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as KeyringEntry;
}

export async function saveKeyring(
  supabase: SupabaseClient,
  userId: string,
  entry: KeyringEntry,
): Promise<void> {
  // Delete existing primary keyrings before inserting new one
  // (PK is user_id+key_id, so upsert with a new key_id would insert, not update)
  await supabase
    .from("user_keyrings")
    .delete()
    .eq("user_id", userId)
    .eq("is_primary", true);
  await supabase
    .from("user_keyrings")
    .insert({ ...entry, user_id: userId });
}
