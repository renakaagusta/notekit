import type { AIProvider } from "../../../domain/entities/ai";
import type { DeviceIdentity } from "../../../lib/crypto/device-key";

/**
 * Outbound port for the bring-your-own-key AI client. The AI use case depends on
 * this rather than the concrete provider adapter, so the HTTP calls to
 * OpenAI/Anthropic stay behind the composition root.
 */
export interface AiPort {
  askAI(provider: AIProvider, prompt: string, device: DeviceIdentity): Promise<string>;
}
