// In-app purchase: entitlement check + receipt verification. Webhooks
// (apple/google → server) are server-to-server and not exposed here.
// Mirrors apps/api/src/routes/iap.ts and the Entitlement type in
// packages/core/src/lib/notifications-api.ts.

import type { NoteKitClient } from "../transport";
import type { Entitlement } from "../types";

export function iapEndpoints(client: NoteKitClient) {
  return {
    async entitlement(): Promise<Entitlement> {
      return client.request<Entitlement>("/iap/entitlement");
    },
    async verifyApple(input: { receipt: string; productId: string }): Promise<Entitlement> {
      return client.request<Entitlement>("/iap/apple/verify", { method: "POST", body: input });
    },
    async verifyGoogle(input: {
      purchaseToken: string;
      productId: string;
      packageName: string;
    }): Promise<Entitlement> {
      return client.request<Entitlement>("/iap/google/verify", { method: "POST", body: input });
    },
  };
}
