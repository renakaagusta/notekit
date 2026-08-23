/**
 * Outbound port for native (Capacitor) push registration. The push use case
 * depends on this rather than the concrete mobilePush adapter.
 */
export interface MobilePushPort {
  subscribeMobilePush(): Promise<void>;
  unsubscribeMobilePush(token: string): Promise<void>;
}
