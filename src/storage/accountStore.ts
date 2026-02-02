import { STORAGE_PREFIX } from "../utils/constants";

const CURRENT_ACCOUNT_ID_KEY = `${STORAGE_PREFIX}account_current_v1`;
const NEXT_ACCOUNT_ID_KEY = `${STORAGE_PREFIX}account_next_id_v1`;
const USER_ACCOUNT_MAP_KEY = `${STORAGE_PREFIX}account_users_v1`;

const LEGACY_DB_NAME = "dailynotes-unified";
const ACCOUNT_DB_PREFIX = "dailynote-";

type UserAccountMap = Record<string, string>;

function loadUserAccountMap(): UserAccountMap {
  if (typeof window === "undefined") return {};
  const raw = localStorage.getItem(USER_ACCOUNT_MAP_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as UserAccountMap;
  } catch {
    return {};
  }
}

function saveUserAccountMap(map: UserAccountMap): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_ACCOUNT_MAP_KEY, JSON.stringify(map));
}

export function getCurrentAccountId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CURRENT_ACCOUNT_ID_KEY);
}

export function setCurrentAccountId(accountId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CURRENT_ACCOUNT_ID_KEY, accountId);
}

export function getAccountIdForUser(userId: string): string | null {
  if (!userId) return null;
  const map = loadUserAccountMap();
  return map[userId] ?? null;
}

export function getUserIdForAccount(accountId: string): string | null {
  if (!accountId) return null;
  const map = loadUserAccountMap();
  const entry = Object.entries(map).find(([, id]) => id === accountId);
  return entry?.[0] ?? null;
}

export function bindUserToAccount(userId: string, accountId: string): void {
  if (!userId || !accountId) return;
  const map = loadUserAccountMap();
  map[userId] = accountId;
  saveUserAccountMap(map);
}

export function getOrCreateCurrentAccountId(): string {
  const existing = getCurrentAccountId();
  if (existing) return existing;
  const accountId = "1";
  setCurrentAccountId(accountId);
  if (typeof window !== "undefined") {
    localStorage.setItem(NEXT_ACCOUNT_ID_KEY, "2");
  }
  return accountId;
}

export function createNextAccountId(): string {
  if (typeof window === "undefined") return "1";
  const nextRaw = localStorage.getItem(NEXT_ACCOUNT_ID_KEY);
  let nextId = nextRaw ? Number(nextRaw) : NaN;
  if (!Number.isFinite(nextId) || nextId < 2) {
    const current = getCurrentAccountId();
    const map = loadUserAccountMap();
    const ids = [
      current ? Number(current) : 1,
      ...Object.values(map).map((id) => Number(id)),
    ].filter((value) => Number.isFinite(value));
    const maxId = ids.length ? Math.max(...ids) : 1;
    nextId = maxId + 1;
  }
  const newId = String(nextId);
  localStorage.setItem(NEXT_ACCOUNT_ID_KEY, String(nextId + 1));
  return newId;
}

export function getAccountDbName(accountId: string): string {
  if (accountId === "1") return LEGACY_DB_NAME;
  return `${ACCOUNT_DB_PREFIX}${accountId}`;
}

export function getActiveAccountDbName(): string {
  const accountId = getOrCreateCurrentAccountId();
  return getAccountDbName(accountId);
}

export function getAllAccountDbNames(): string[] {
  const names = new Set<string>();
  names.add(LEGACY_DB_NAME);
  if (typeof window === "undefined") return Array.from(names);
  const map = loadUserAccountMap();
  Object.values(map).forEach((accountId) => {
    names.add(getAccountDbName(accountId));
  });
  const current = getCurrentAccountId();
  if (current) {
    names.add(getAccountDbName(current));
  }
  return Array.from(names);
}

export function getLegacyDbName(): string {
  return LEGACY_DB_NAME;
}
