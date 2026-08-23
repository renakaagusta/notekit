import type { VaultEventStream } from "../ports/in/VaultEventStream";
import type { NotifierPort } from "../ports/out/NotifierPort";

/**
 * Use case implementing {@link VaultEventStream}: delegates to the injected
 * {@link NotifierPort}. The UI depends on this inbound capability, which depends
 * only on the outbound port — the SSE transport is swappable.
 */
export function createVaultEventStream(notifier: NotifierPort): VaultEventStream {
  return {
    start: (opts) => notifier.start(opts),
    stop: () => notifier.stop(),
  };
}
