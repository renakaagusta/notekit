/**
 * Inbound port: the push-notification subscription capability the settings UI
 * drives. Bundles web + native push behind one application capability; the use
 * case delegates each to the matching outbound port.
 */
export interface PushService {
  subscribeWebPush(): Promise<void>;
  unsubscribeWebPush(): Promise<void>;
  isWebPushSubscribed(): Promise<boolean>;
  subscribeMobilePush(): Promise<void>;
}
