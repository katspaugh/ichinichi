export interface KeyringProvider {
  activeKeyId: string;
  getKey: (keyId: string) => CryptoKey | null;
}
