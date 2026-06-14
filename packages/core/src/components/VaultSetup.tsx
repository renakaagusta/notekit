import { useEffect, useRef, useState } from "react";
import { useCryptoStore } from "../stores/cryptoStore";
import { useRecoveryBackupStore } from "../stores/recoveryBackupStore";
import { createDeviceIdentity, loadDeviceIdentity } from "../lib/crypto/device-key";
import {
  createAndStoreRecovery,
  loadStoredRecovery,
  importRecovery,
} from "../lib/crypto/recovery-store";
import {
  recoveryFromMnemonic,
  recoverySigningFromMnemonic,
} from "../lib/crypto/recovery";
import { RecoveryPhraseDialog } from "./VaultPairing";
import { deriveWalletVaultIdentity } from "../lib/crypto/wallet-key";
import {
  connectWallet,
  detectedWallet,
  hasInjectedWallet,
  type WalletId,
} from "../lib/crypto/wallet-provider";
import { initVault } from "../lib/secrets-vault";
import { useAuthStore } from "../stores/authStore";
import {
  MetaMaskIcon,
  RabbyIcon,
  CoinbaseIcon,
  WalletConnectIcon,
  WalletIcon,
} from "./BrandIcons";

/** Render the brand logo for a detected wallet id. */
function WalletLogo({ id, size = 20 }: { id: WalletId; size?: number }) {
  if (id === "metamask") return <MetaMaskIcon size={size} />;
  if (id === "rabby") return <RabbyIcon size={size} />;
  if (id === "coinbase") return <CoinbaseIcon size={size} />;
  return <WalletIcon size={size} />;
}

/**
 * Silent vault setup. No 24-word wall: we generate the recovery key, stash it
 * in the device's secure store, initialize the vault, and go straight to ready.
 * The user can back the phrase up later from the nudge / Secrets panel — and
 * is reminded to, once they actually encrypt something.
 *
 * Renders only a brief "setting up" beat (and an error fallback), so the user
 * effectively never sees a key ceremony on a fresh device.
 */
export function VaultSetup() {
  const setPhase = useCryptoStore((s) => s.setPhase);
  const setDevice = useCryptoStore((s) => s.setDevice);
  const setError = useCryptoStore((s) => s.setError);
  const setEncryptionRequired = useCryptoStore((s) => s.setEncryptionRequired);
  const refreshBackup = useRecoveryBackupStore((s) => s.refresh);

  const [failed, setFailed] = useState<string | null>(null);
  // Web3 users can root the vault in their wallet instead of a generated phrase.
  // Offer the choice once if a wallet is present; otherwise set up silently.
  // Always offer the root choice (generate / wallet / existing phrase) so the
  // "use an existing phrase" option is reachable. One tap on "Create a new
  // recovery phrase" keeps the common path nearly as quiet as before.
  const [choosing, setChoosing] = useState(true);
  const [walletBusy, setWalletBusy] = useState(false);
  // "I already have a recovery phrase" path — reuse a phrase the user holds
  // elsewhere so this vault shares one secret with their others (verbatim).
  const [importOpen, setImportOpen] = useState(false);
  const [importValue, setImportValue] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  // Guard against React 18 StrictMode double-invoke creating two vaults.
  const ranRef = useRef(false);

  useEffect(() => {
    if (choosing) return; // wait for the user to pick a root
    if (ranRef.current) return;
    ranRef.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choosing]);

  /**
   * Build the owner descriptor (member #0) from the signed-in account.
   */
  function ownerFromAccount() {
    const account = useAuthStore.getState().user;
    return account?.email
      ? { memberId: account.email, displayName: account.name ?? undefined, email: account.email }
      : undefined;
  }

  /**
   * Root the new vault in the connected EVM wallet. The wallet signature
   * derives the recovery identity + signing key, so no phrase is generated or
   * stored — the wallet *is* the backup. Each future device self-unlocks by
   * signing again (see VaultPairing.onUseWallet).
   */
  async function runWallet() {
    setFailed(null);
    setWalletBusy(true);
    try {
      const device = (await loadDeviceIdentity()) ?? (await createDeviceIdentity());
      const conn = await connectWallet();
      const { identity, signing } = await deriveWalletVaultIdentity(conn.sign);
      await initVault({
        device,
        recoveryRecipient: identity.recipient,
        recoverySigning: signing,
        owner: ownerFromAccount(),
      });
      setDevice(device);
      setEncryptionRequired(true);
      await refreshBackup();
      setChoosing(false);
      setPhase("ready");
    } catch (e) {
      setFailed((e as Error).message);
    } finally {
      setWalletBusy(false);
    }
  }

  /**
   * Root the new vault in a recovery phrase the user already has (from another
   * device or a written backup). The vault adopts that key verbatim, so one
   * phrase unlocks all vaults that share it — and the on-device cache (a single
   * slot) then matches every such vault. Trade-off: shared blast radius across
   * vaults that reuse the phrase; that's the user's deliberate choice here.
   */
  async function runImport() {
    const mnemonic = importValue.trim();
    if (!mnemonic) return;
    setImportBusy(true);
    setImportError(null);
    try {
      const device =
        (await loadDeviceIdentity()) ?? (await createDeviceIdentity());
      // Throws on an invalid BIP39 phrase — surfaced inline below.
      const { recipient } = await recoveryFromMnemonic(mnemonic);
      const recoverySigning = await recoverySigningFromMnemonic(mnemonic);
      await initVault({
        device,
        recoveryRecipient: recipient,
        recoverySigning,
        owner: ownerFromAccount(),
      });
      // Cache the phrase locally (marked backed-up — the user already holds it)
      // so the recovery sheet and nudge stay consistent on this device.
      await importRecovery(mnemonic).catch(() => {});
      setDevice(device);
      setEncryptionRequired(true);
      await refreshBackup();
      setImportOpen(false);
      setChoosing(false);
      setPhase("ready");
    } catch (e) {
      setImportError((e as Error).message);
    } finally {
      setImportBusy(false);
    }
  }

  async function run() {
    setFailed(null);
    try {
      const device = (await loadDeviceIdentity()) ?? (await createDeviceIdentity());
      // Reuse an existing on-device recovery copy if one is somehow already
      // present (e.g. a half-finished prior run); otherwise mint a fresh one.
      const recovery =
        (await loadStoredRecovery()) ?? (await createAndStoreRecovery());
      // Born-signed: derive the recovery signing key from the mnemonic this
      // device holds, so the vault's records are signed from the start and
      // injected recipients can be rejected (device-key-resilience §5).
      const recoverySigning = await recoverySigningFromMnemonic(recovery.mnemonic);
      // Born-with-membership: stamp the owner as member #0 (keyed by account
      // email, matching how the directory looks members up).
      await initVault({
        device,
        recoveryRecipient: recovery.recipient,
        recoverySigning,
        owner: ownerFromAccount(),
      });
      setDevice(device);
      // initVault stamps `encryption: required`; reflect that in the live store
      // immediately. Without this, bootstrap's earlier read (of the then-absent
      // config) leaves the flag false for this first session, so items created
      // before a reload would be written as plaintext. (born-E2EE default.)
      setEncryptionRequired(true);
      await refreshBackup();
      setPhase("ready");
    } catch (e) {
      // Don't flip the global phase to "error" — that would tear down the app
      // shell. Surface a local retry instead.
      setFailed((e as Error).message);
    }
  }

  // Web3 path: lead with the user's detected wallet as the hero, with a muted
  // "works with" logo strip for trust and the recovery phrase demoted to a
  // quiet link. Shown only when a wallet is detected.
  if (choosing && !failed) {
    const hasWallet = hasInjectedWallet();
    const wallet = detectedWallet() ?? { id: "wallet" as WalletId, name: "wallet" };
    return (
      <div className="nk-modal-backdrop">
        <div className="nk-modal nk-vault-setup nk-vault-secure">
          <h2>Secure your notes</h2>
          <p className="nk-muted">
            {hasWallet
              ? "End-to-end encrypted. Your wallet holds the key — nothing else to back up, and any device unlocks by signing again."
              : "End-to-end encrypted. We'll generate a recovery phrase for you — or reuse one you already have."}
          </p>

          {hasWallet && (
            <>
              <button
                className="nk-wallet-cta"
                onClick={() => void runWallet()}
                disabled={walletBusy}
              >
                <WalletLogo id={wallet.id} size={22} />
                <span>
                  {walletBusy
                    ? "Waiting for wallet…"
                    : `Continue with ${wallet.name}`}
                </span>
              </button>

              <div className="nk-wallet-strip">
                <span className="nk-wallet-strip__label">works with</span>
                <MetaMaskIcon size={18} />
                <RabbyIcon size={18} />
                <CoinbaseIcon size={18} />
                <WalletConnectIcon size={18} />
              </div>
            </>
          )}

          <button
            className={hasWallet ? "nk-textlink nk-wallet-alt" : "nk-btn nk-btn--primary"}
            onClick={() => setChoosing(false)}
            disabled={walletBusy || importBusy}
          >
            {hasWallet
              ? "Prefer a recovery phrase? Set it up →"
              : "Create a new recovery phrase"}
          </button>

          <button
            className="nk-textlink nk-wallet-alt"
            onClick={() => setImportOpen(true)}
            disabled={walletBusy || importBusy}
          >
            I already have a recovery phrase →
          </button>
          {failed && <p className="nk-error-text">{failed}</p>}
        </div>
        {importOpen && (
          <RecoveryPhraseDialog
            busy={importBusy}
            error={importError}
            value={importValue}
            onChange={setImportValue}
            onCancel={() => {
              setImportOpen(false);
              setImportError(null);
              setImportValue("");
            }}
            onSubmit={() => void runImport()}
          />
        )}
      </div>
    );
  }

  if (!failed) {
    return (
      <div className="nk-modal-backdrop">
        <div className="nk-modal nk-vault-setup">
          <h2>Setting up your encrypted space…</h2>
          <p className="nk-muted">One moment — generating your keys on this device.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="nk-modal-backdrop">
      <div className="nk-modal nk-vault-setup">
        <h2>Couldn't finish setup</h2>
        <p className="nk-error-text">{failed}</p>
        <div className="nk-modal-actions">
          <button className="nk-btn" onClick={() => setError(failed)}>
            Dismiss
          </button>
          <button
            className="nk-btn nk-btn--primary"
            onClick={() => {
              ranRef.current = false;
              void run();
            }}
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
