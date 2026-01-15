export interface CloudVaultUnlockResult {
  vaultKey: CryptoKey | null;
  keyring: Map<string, CryptoKey>;
  primaryKeyId: string | null;
}

export interface VaultService {
  tryDeviceUnlockCloudKey(): Promise<{ vaultKey: CryptoKey; keyId: string } | null>;
  unlockCloudVault(options: {
    userId: string;
    password: string;
    localDek: CryptoKey | null;
    localKeyring: Map<string, CryptoKey>;
  }): Promise<CloudVaultUnlockResult>;
  getHasLocalVault(): boolean;
  bootstrapLocalVault(): Promise<{
    hasVault: boolean;
    requiresPassword: boolean;
    vaultKey: CryptoKey | null;
  }>;
  unlockLocalVault(options: {
    password: string;
    hasVault: boolean;
  }): Promise<{ vaultKey: CryptoKey; hasVault: boolean }>;
}
