/**
 * Composition root for the crypto boot orchestrator.
 *
 * The ONE place crypto-bootstrap is bound to its logger adapter. Wiring runs
 * eagerly at import — before boot is triggered — so behavior is identical to the
 * old direct logger import. Import bootstrap entry points from here.
 */
import { loggerPort } from "../adapters/driven/logger";
import { configureCryptoBootstrap } from "../lib/crypto-bootstrap";

configureCryptoBootstrap({ logger: loggerPort });

export * from "../lib/crypto-bootstrap";
