/**
 * The bring-your-own-key AI providers a user can call from the in-app AI panel.
 * A pure domain value: the key for each is stored as a vault secret and the
 * request is made by a driven adapter.
 */
export type AIProvider = "openai" | "anthropic";
