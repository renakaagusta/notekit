/**
 * Outbound port for the notification delivery channels. The emit use case fans
 * out through this instead of importing the channel adapters directly. Each
 * channel keeps the exact signature the adapters already expose.
 */
export interface NotificationChannelsPort {
  sendTelegram(userId: string, summary: string, notificationId: string): Promise<void>;
  sendWebPush(
    userId: string,
    summary: string,
    notificationId: string,
    payload: Record<string, unknown>,
  ): Promise<void>;
  sendMobilePush(
    userId: string,
    summary: string,
    notificationId: string,
    payload: Record<string, unknown>,
  ): Promise<void>;
}
