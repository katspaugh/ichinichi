import { STORAGE_PREFIX } from "../utils/constants";
import { parseCloudKeyIdStore, type CloudKeyIdStore } from "./parsers";

const CLOUD_KEY_IDS_KEY = `${STORAGE_PREFIX}cloud_key_ids_v1`;

function loadStore(): CloudKeyIdStore {
  if (typeof window === "undefined") return {};
  const raw = localStorage.getItem(CLOUD_KEY_IDS_KEY);
  if (!raw) return {};
  try {
    return parseCloudKeyIdStore(JSON.parse(raw)) ?? {};
  } catch {
    return {};
  }
}

function saveStore(store: CloudKeyIdStore): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CLOUD_KEY_IDS_KEY, JSON.stringify(store));
}

export function rememberCloudKeyIds(userId: string, keyIds: string[]): void {
  if (!userId || !keyIds.length) return;
  const store = loadStore();
  const existing = new Set(store[userId] ?? []);
  keyIds.forEach((id) => existing.add(id));
  store[userId] = Array.from(existing);
  saveStore(store);
}

export function getCloudKeyIds(userId: string): string[] {
  if (!userId) return [];
  const store = loadStore();
  return store[userId] ?? [];
}

export function clearCloudKeyIds(userId: string): void {
  if (!userId) return;
  const store = loadStore();
  if (store[userId]) {
    delete store[userId];
    saveStore(store);
  }
}
