import type { ProviderConfigPort } from "../../../application/ports/out/ProviderConfigPort";
import { getProvider } from "./providers";

/** Static-config implementation of {@link ProviderConfigPort}. */
export const providerConfigPort: ProviderConfigPort = {
  getProvider,
};
