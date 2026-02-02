import { clearCloudDekCache } from "./cloudCache";
import { clearDeviceWrappedDEK } from "./vault";
import {
  bindUserToAccount,
  createNextAccountId,
  getAccountIdForUser,
  getOrCreateCurrentAccountId,
  getUserIdForAccount,
  setCurrentAccountId,
} from "./accountStore";

async function resetCloudUnlockState(): Promise<void> {
  clearCloudDekCache();
  await clearDeviceWrappedDEK();
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
    return;
  }

  const newAccountId = createNextAccountId();
  bindUserToAccount(nextUserId, newAccountId);
  setCurrentAccountId(newAccountId);
  await resetCloudUnlockState();
}
