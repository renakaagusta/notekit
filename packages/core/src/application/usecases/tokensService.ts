import type { TokensService } from "../ports/in/TokensService";
import type { TokensPort } from "../ports/out/TokensPort";

/**
 * Use case implementing {@link TokensService}: delegates each operation to the
 * injected {@link TokensPort}. The UI depends on this inbound capability, which
 * depends only on the outbound port — the tokens transport is swappable.
 */
export function createTokensService(tokens: TokensPort): TokensService {
  return {
    listTokens: () => tokens.listTokens(),
    createToken: (input) => tokens.createToken(input),
    revokeToken: (id) => tokens.revokeToken(id),
  };
}
