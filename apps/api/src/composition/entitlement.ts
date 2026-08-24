/**
 * Composition root for the IAP entitlement use case: binds the recompute use
 * case to the Drizzle repository. Routes import the wired function from here.
 */
import { iapEntitlementRepository } from "../adapters/driven/iap/entitlementRepository";
import { createRecomputePlusForUser } from "../application/usecases/recomputePlus";

export const recomputePlusForUser = createRecomputePlusForUser(iapEntitlementRepository);
