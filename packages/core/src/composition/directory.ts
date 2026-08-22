/**
 * Composition root for the public-key directory client.
 *
 * The ONE place the directory module is bound to its driven adapters (REST
 * client + logger). Wiring runs eagerly at import — before any consumer calls a
 * directory function — so behavior is identical to the old direct imports; only
 * the dependency direction is now clean. Import directory functions from here.
 */
import { apiFetchPort } from "../adapters/driven/api";
import { loggerPort } from "../adapters/driven/logger";
import { configureDirectory } from "../lib/directory";

configureDirectory({ apiFetch: apiFetchPort, logger: loggerPort });

export * from "../lib/directory";
