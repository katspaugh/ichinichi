import { STORAGE_PREFIX } from "../utils/constants";
import { base64ToBytes, bytesToBase64, randomBytes } from "./cryptoUtils";

const CLOUD_DEK_CACHE_KEY = `${STORAGE_PREFIX}cloud_dek_cache_v1`;
const CACHE_IV_BYTES = 12;

interface CloudDekCachePayload {
  iv: string;
  data: string;
}

export async function cacheCloudDek(
  localVaultKey: CryptoKey,
  cloudVaultKey: CryptoKey,
): Promise<void> {
  try {
    const raw = await crypto.subtle.exportKey("raw", cloudVaultKey);
    const iv = randomBytes(CACHE_IV_BYTES);
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      localVaultKey,
      raw,
    );
    const payload: CloudDekCachePayload = {
      iv: bytesToBase64(iv),
      data: bytesToBase64(new Uint8Array(encrypted)),
    };
    localStorage.setItem(CLOUD_DEK_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore cache errors; device-wrapped DEK is the primary path.
  }
}

export async function restoreCloudDek(
  localVaultKey: CryptoKey,
): Promise<CryptoKey | null> {
  const raw = localStorage.getItem(CLOUD_DEK_CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CloudDekCachePayload;
    if (!parsed?.iv || !parsed?.data) return null;
    const iv = base64ToBytes(parsed.iv);
    const data = base64ToBytes(parsed.data);
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
  } catch {
    return null;
  }
}

export function clearCloudDekCache(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CLOUD_DEK_CACHE_KEY);
}
