import type { TokenCryptoPort } from "../../../application/ports/out/TokenCryptoPort";
import { encryptToken, decryptToken } from "./tokenCrypto";

/** AES-256-GCM implementation of {@link TokenCryptoPort}. */
export const tokenCryptoPort: TokenCryptoPort = {
  encrypt: encryptToken,
  decrypt: decryptToken,
};
