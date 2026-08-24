// MCP composition root barrel. This is the ONLY place the driving adapters
// (tools, resources, prompts, transports, server) reach the driven adapters
// (transport client, E2EE crypto, project/git detection, stderr logger) and
// the pure domain helpers they consume (scope resolution, frontmatter). The
// driving layer imports from here instead of from adapters/driven directly, so
// it never couples to a driven adapter — parity with apps/cli commands and
// apps/api routes going through composition.

export {
  makeClient,
  listVaultFiles,
  jsonContent,
  jsonContentWithStructured,
  textContent,
  errorContent,
  isEncryptedItemPath,
  encryptedSkippedNote,
  type NoteKitMcpConfig,
} from "../adapters/driven/notekit.js";

export {
  VaultLockedError,
  tryVaultIdentity,
  requireVaultIdentity,
  isEncrypted,
  vaultIsEncrypted,
  decryptNote,
  decryptTicket,
  encryptNote,
  encryptTicket,
  listEncryptedNotes,
  listEncryptedTickets,
  decryptLink,
  encryptLink,
  listEncryptedLinks,
} from "../adapters/driven/crypto.js";

export {
  resolveProjectContext,
  parseMarkerFile,
  parseMarkerContent,
  deriveSlugFromGit,
  slugFromRemoteUrl,
  ownerRepoFromRemoteUrl,
  ownerRepoFromGit,
  findGitRoot,
  slugify,
} from "../adapters/driven/project.js";

export { logger } from "../adapters/driven/logger.js";

export {
  resolveScope,
  projectOfPath,
  isUnderAnyPrefix,
  type ItemKind,
  type ResolveScopeOptions,
  type ResolvedScope,
  type ProjectScope,
  type ProjectMarker,
} from "../domain/scope.js";

export {
  parseMarkdown,
  serializeMarkdown,
  type Frontmatter,
  type MarkdownFile,
} from "../domain/markdown.js";
