import type { GoogleSubscriptionVerifier } from "../../../application/ports/out/GoogleSubscriptionVerifier";
import { lookupSubscription } from "./google";

/** Google Play Developer API implementation of {@link GoogleSubscriptionVerifier}. */
export const googleSubscriptionVerifier: GoogleSubscriptionVerifier = {
  lookupSubscription(purchaseToken) {
    return lookupSubscription(purchaseToken);
  },
};
