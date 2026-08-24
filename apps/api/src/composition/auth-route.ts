/**
 * Composition root for the auth driving route: binds the auth persistence,
 * token-encryption, GitHub App, Apple, and OAuth-provider-config ports to their
 * driven adapters, then re-exports the wired functions. The driving route
 * imports everything auth-related from here so it never reaches into a driven
 * adapter.
 */
import { appleAuthPort } from "../adapters/driven/auth/appleAuthPort";
import { providerConfigPort } from "../adapters/driven/auth/providerConfigPort";
import { tokenCryptoPort } from "../adapters/driven/auth/tokenCryptoPort";
import { authRepository } from "../adapters/driven/db/authRepository";
import { githubAppProviderPort } from "../adapters/driven/git/githubAppProviderPort";

export const authRepo = authRepository;
export const encryptToken = tokenCryptoPort.encrypt;

export const githubAppConfigured = githubAppProviderPort.configured;
export const exchangeGithubUserCode = githubAppProviderPort.exchangeUserCode;

export const appleAuthorizeUrl = appleAuthPort.authorizeUrl;
export const exchangeAppleCodeForProfile = appleAuthPort.exchangeCodeForProfile;
export const verifyAppleNativeIdToken = appleAuthPort.verifyNativeIdToken;

export const getProvider = providerConfigPort.getProvider;
