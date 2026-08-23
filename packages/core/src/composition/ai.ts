/**
 * Composition root for the AI service. Binds the AiService use case to the
 * concrete BYO-key AI client adapter. Driving adapters import the wired service.
 */
import { aiPort } from "../adapters/driven/ai-client";
import { createAiService } from "../application/usecases/aiService";

export const aiService = createAiService(aiPort);
