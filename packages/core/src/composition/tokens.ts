/**
 * Composition root for the tokens service. Binds the TokensService use case to
 * the concrete personal-access-token REST adapter. Driving adapters import the
 * wired service.
 */
import { tokensPort } from "../adapters/driven/api";
import { createTokensService } from "../application/usecases/tokensService";

export const tokensService = createTokensService(tokensPort);
