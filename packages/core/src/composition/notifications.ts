/**
 * Composition root for the notifications service. Binds the NotificationsService
 * use case to the concrete notifications REST adapter. Driving adapters import
 * the wired service.
 */
import { notificationsPort } from "../adapters/driven/notifications-api";
import { createNotificationsService } from "../application/usecases/notificationsService";

export const notificationsService = createNotificationsService(notificationsPort);
