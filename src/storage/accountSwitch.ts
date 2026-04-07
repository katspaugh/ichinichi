import { clearCloudDekCache } from "./cloudCache";
import { clearDeviceEncryptedPassword, clearDeviceWrappedDEK } from "./vault";
import {
  bindUserToAccount,
  createNextAccountId,
  getAccountIdForUser,
  getOrCreateCurrentAccountId,
  getUserIdForAccount,
  setCurrentAccountId,
} from "./accountStore";

async function resetCloudUnlockState(): Promise<void> {
  // With RxDB, each user has their own database (ichinichi-{userId}).
  // No need to close a shared IndexedDB; just clear auth caches.
  clearCloudDekCache();
  await Promise.all([clearDeviceWrappedDEK(), clearDeviceEncryptedPassword()]);
}

export async function handleCloudAccountSwitch(
  nextUserId: string | null,
): Promise<void> {
  const currentAccountId = getOrCreateCurrentAccountId();
  if (!nextUserId) return;

  const existingAccountId = getAccountIdForUser(nextUserId);
  if (existingAccountId) {
    if (existingAccountId !== currentAccountId) {
      setCurrentAccountId(existingAccountId);
      await resetCloudUnlockState();
    }
    return;
  }

  const currentUserId = getUserIdForAccount(currentAccountId);
  if (!currentUserId) {
    bindUserToAccount(nextUserId, currentAccountId);
    // With RxDB, pending ops are handled by replication, no manual marking needed
    return;
  }

  const newAccountId = createNextAccountId();
  bindUserToAccount(nextUserId, newAccountId);
  setCurrentAccountId(newAccountId);
  await resetCloudUnlockState();
}
