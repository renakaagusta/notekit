/**
 * Outbound port for browser Web Push (service-worker subscription). The push
 * use case depends on this rather than the concrete webPush adapter.
 */
export interface WebPushPort {
  subscribeWebPush(): Promise<void>;
  unsubscribeWebPush(): Promise<void>;
  isWebPushSubscribed(): Promise<boolean>;
}
