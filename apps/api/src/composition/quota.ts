/**
 * Composition root for the storage-quota use case: binds the quota use case to
 * the Drizzle/Forgejo repository. Routes import the wired functions from here.
 */
import { quotaRepository } from "../adapters/driven/vault/quotaRepository";
import { createQuota } from "../application/usecases/quota";

const quota = createQuota(quotaRepository);

export const checkWriteAllowed = quota.checkWriteAllowed;
export const refreshUsedBytesIfStale = quota.refreshUsedBytesIfStale;
