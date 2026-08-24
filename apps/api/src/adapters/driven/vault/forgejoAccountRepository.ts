import type {
  ForgejoAccountRecord,
  ForgejoAccountRepository,
} from "../../../application/ports/out/ForgejoAccountRepository";
import { getForgejoAccount, provisionForgejoAccount } from "./forgejoAccounts";

/** Forgejo-backed implementation of {@link ForgejoAccountRepository}. */
export const forgejoAccountRepository: ForgejoAccountRepository = {
  get(userId: string): Promise<ForgejoAccountRecord | null> {
    return getForgejoAccount(userId);
  },
  provision(
    userId: string,
    email: string,
    displayName: string | null,
  ): Promise<ForgejoAccountRecord> {
    return provisionForgejoAccount(userId, email, displayName);
  },
};
