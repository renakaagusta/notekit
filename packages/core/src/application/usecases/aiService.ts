import type { AiService } from "../ports/in/AiService";
import type { AiPort } from "../ports/out/AiPort";

/**
 * Use case implementing {@link AiService}: delegates to the injected
 * {@link AiPort}. The UI depends on this inbound capability, which depends only
 * on the outbound port — the provider transport is swappable.
 */
export function createAiService(ai: AiPort): AiService {
  return {
    askAI: (provider, prompt, device) => ai.askAI(provider, prompt, device),
  };
}
