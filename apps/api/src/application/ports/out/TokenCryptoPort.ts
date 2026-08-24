/**
 * Outbound port for at-rest encryption of provider access tokens. The vault
 * provider use case depends on this instead of the concrete `auth/tokenCrypto`
 * driven adapter.
 */
export interface TokenCryptoPort {
  encrypt(plain: string): string;
  decrypt(stored: string): string;
}
