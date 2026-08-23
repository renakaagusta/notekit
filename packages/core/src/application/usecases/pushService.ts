import type { PushService } from "../ports/in/PushService";
import type { MobilePushPort } from "../ports/out/MobilePushPort";
import type { WebPushPort } from "../ports/out/WebPushPort";

/**
 * Use case implementing {@link PushService}: delegates web-push operations to
 * the {@link WebPushPort} and native registration to the {@link MobilePushPort}.
 * The UI depends on this inbound capability, not the concrete push adapters.
 */
export function createPushService(web: WebPushPort, mobile: MobilePushPort): PushService {
  return {
    subscribeWebPush: () => web.subscribeWebPush(),
    unsubscribeWebPush: () => web.unsubscribeWebPush(),
    isWebPushSubscribed: () => web.isWebPushSubscribed(),
    subscribeMobilePush: () => mobile.subscribeMobilePush(),
  };
}
