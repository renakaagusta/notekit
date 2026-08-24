import type { GitlabProviderPort } from "../../../application/ports/out/GitlabProviderPort";
import { getCurrentUserInfo, getUserLogin } from "./gitlab";

/** GitLab-API implementation of {@link GitlabProviderPort}. */
export const gitlabProviderPort: GitlabProviderPort = {
  getUserLogin,
  getCurrentUserInfo,
};
