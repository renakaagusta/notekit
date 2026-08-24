import type {
  GitOpsPort,
  GitOpsResolverPort,
} from "../../../application/ports/out/GitOpsPort";
import type { GitProvider } from "../../../domain/git-provider";
import * as fj from "../git/forgejo";
import * as gh from "../git/github";
import * as gl from "../git/gitlab";

/**
 * Binds each git provider to its concrete backend wrapper. Preserves the exact
 * provider→client mapping the routes relied on: `notekit` → Forgejo,
 * `gitlab` → GitLab, everything else → GitHub. The three modules expose the
 * same common surface, so each satisfies {@link GitOpsPort} structurally.
 */
function resolve(provider: GitProvider): GitOpsPort {
  if (provider === "notekit") return fj;
  if (provider === "gitlab") return gl;
  return gh;
}

export const gitOpsResolver: GitOpsResolverPort = { resolve };
