/**
 * Composition root for the OAuth upsert use case: binds it to the Drizzle user
 * repository and the token-encryption adapter. Routes import the wired function
 * from here.
 */
import { encryptToken } from "../adapters/driven/auth/tokenCrypto";
import { userRepository } from "../adapters/driven/auth/userRepository";
import { createUpsertUserFromOAuth } from "../application/usecases/upsertUserFromOAuth";

export const upsertUserFromOAuth = createUpsertUserFromOAuth(userRepository, {
  encryptToken,
});
