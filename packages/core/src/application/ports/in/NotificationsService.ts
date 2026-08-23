import type { NotificationsPort } from "../out/NotificationsPort";

/**
 * Inbound port: the notifications capability the UI drives (list, mark read,
 * manage channel prefs, device-paired alerts, entitlement lookup). Its shape
 * mirrors the outbound {@link NotificationsPort} because these are pass-through
 * operations today; keeping a distinct inbound type marks the boundary the
 * driving adapters depend on.
 */
export type NotificationsService = NotificationsPort;
