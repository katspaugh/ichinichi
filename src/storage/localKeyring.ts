import { STORAGE_PREFIX } from "../utils/constants";
import { base64ToBytes, bytesToBase64, randomBytes } from "./cryptoUtils";

const KEYRING_STORAGE_KEY = `${STORAGE_PREFIX}keyring_v1`;

interface KeyringEntry {
  wrappedDek: string;
  dekIv: string;
}

type KeyringStore = Record<string, KeyringEntry>;

function loadKeyring(): KeyringStore {
  if (typeof window === "undefined") return {};
  const raw = localStorage.getItem(KEYRING_STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as KeyringStore;
  } catch {
    return {};
  }
}

function saveKeyring(store: KeyringStore): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEYRING_STORAGE_KEY, JSON.stringify(store));
}

export function listLocalKeyIds(): string[] {
  return Object.keys(loadKeyring());
}

export async function storeLocalWrappedKey(
  keyId: string,
  dek: CryptoKey,
  localVaultKey: CryptoKey,
): Promise<void> {
  const raw = await crypto.subtle.exportKey("raw", dek);
  const iv = randomBytes(12);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    localVaultKey,
    raw,
  );
  const wrapped = {
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encrypted)),
  };
  const store = loadKeyring();
  store[keyId] = {
    wrappedDek: wrapped.data,
    dekIv: wrapped.iv,
  };
  saveKeyring(store);
}

export async function restoreLocalWrappedKey(
  keyId: string,
  localVaultKey: CryptoKey,
): Promise<CryptoKey | null> {
  const store = loadKeyring();
  const entry = store[keyId];
  if (!entry) return null;
  const iv = base64ToBytes(entry.dekIv);
  const data = base64ToBytes(entry.wrappedDek);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    localVaultKey,
    data,
  );
  return crypto.subtle.importKey(
    "raw",
    decrypted,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

export function removeLocalWrappedKeys(keyIds: string[]): void {
  if (typeof window === "undefined") return;
  if (!keyIds.length) return;
  const store = loadKeyring();
  let mutated = false;
  for (const keyId of keyIds) {
    if (keyId in store) {
      delete store[keyId];
      mutated = true;
    }
  }
  if (mutated) {
    saveKeyring(store);
  }
}
