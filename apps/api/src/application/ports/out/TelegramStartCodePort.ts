/**
 * Outbound port for consuming a Telegram `/start <code>` link. The poller use
 * case depends on this instead of importing the Telegram driven adapter.
 */
export interface TelegramStartCodePort {
  consumeStartCode(
    code: string,
    chatId: string,
  ): Promise<{ ok: true; userId: string } | { ok: false; reason: string }>;
}
