/**
 * Composition root for push notifications. Binds the PushService use case to the
 * concrete web-push and mobile-push adapters. Driving adapters import the wired
 * service.
 */
import { mobilePushPort } from "../adapters/driven/mobilePush";
import { webPushPort } from "../adapters/driven/webPush";
import { createPushService } from "../application/usecases/pushService";

export const pushService = createPushService(webPushPort, mobilePushPort);
