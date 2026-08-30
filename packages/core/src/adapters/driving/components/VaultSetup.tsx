import { useEffect, useRef, useState } from "react";
import { createDeviceIdentity, loadDeviceIdentity } from "../../../composition/device-key";
import type { DeviceIdentity } from "../../../lib/crypto/device-key";
import {
  recoveryFromMnemonic,
  recoverySigningFromMnemonic,
} from "../../../lib/crypto/recovery";
import type { RecoverySigningKey } from "../../../lib/crypto/recovery";
import {
  createAndStoreRecovery,
  loadStoredRecovery,
  importRecovery,
} from "../../../lib/crypto/recovery-store";
import { deriveWalletVaultIdentity } from "../../../lib/crypto/wallet-key";
import {
  connectWallet,
  detectedWallet,
  hasInjectedWallet,
  type WalletId,
} from "../../../lib/crypto/wallet-provider";
import {
  initVault,
  initVaultWithPerDeviceApprovals,
  getActiveVaultKey,
} from "../../../lib/secrets-vault";
import { useAuthStore } from "../stores/authStore";
import { useCryptoStore } from "../stores/cryptoStore";
import { useRecoveryBackupStore } from "../stores/recoveryBackupStore";
import {
  MetaMaskIcon,
  RabbyIcon,
  CoinbaseIcon,
  WalletConnectIcon,
  WalletIcon,
} from "./BrandIcons";
import { Modal } from "./Modal";
import { RecoveryPhraseDialog } from "./VaultPairing";

/** Render the brand logo for a detected wallet id. */
function WalletLogo({ id, size = 20 }: { id: WalletId; size?: number }) {
  if (id === "metamask") return <MetaMaskIcon size={size} />;
  if (id === "rabby") return <RabbyIcon size={size} />;
  if (id === "coinbase") return <CoinbaseIcon size={size} />;
  return <WalletIcon size={size} />;
}

function WalletCta({
  wallet,
  busy,
  onRun,
}: {
  wallet: { id: WalletId; name: string };
  busy: boolean;
  onRun: () => void;
}) {
  return (
    <>
      <button
        className="nk-wallet-cta"
        onClick={onRun}
        disabled={busy}
      >
        <WalletLogo id={wallet.id} size={22} />
        <span>
          {busy
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
  );
}

function PerDeviceApprovalsToggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="nk-vault-optin">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
      <span>
        <strong>Per-device approvals (recommended)</strong>
        <span className="nk-muted">
          Each new device is approved from one you already trust — no need
          to type your recovery phrase to add a device, and revoking one
          takes effect immediately.
        </span>
      </span>
    </label>
  );
}

function ChoosingView({
  walletBusy,
  importBusy,
  failed,
  perDeviceApprovals,
  onWalletRun,
  onChoosePhrase,
  onImportOpen,
  onPerDeviceApprovalsChange,
}: {
  walletBusy: boolean;
  importBusy: boolean;
  failed: string | null;
  perDeviceApprovals: boolean;
  onWalletRun: () => void;
  onChoosePhrase: () => void;
  onImportOpen: () => void;
  onPerDeviceApprovalsChange: (value: boolean) => void;
}) {
  const hasWallet = hasInjectedWallet();
  const wallet = detectedWallet() ?? { id: "wallet" as WalletId, name: "wallet" };
  const anyBusy = walletBusy || importBusy;

  return (
    <Modal open onClose={() => undefined} title="Secure your notes" isDismissable={false}>
      <p className="nk-muted">
        {hasWallet
          ? "End-to-end encrypted. Your wallet holds the key — nothing else to back up, and any device unlocks by signing again."
          : "End-to-end encrypted. We'll generate a recovery phrase for you — or reuse one you already have."}
      </p>

      {hasWallet && (
        <WalletCta wallet={wallet} busy={walletBusy} onRun={onWalletRun} />
      )}

      <button
        className={hasWallet ? "nk-textlink nk-wallet-alt" : "nk-btn nk-btn--primary"}
        onClick={onChoosePhrase}
        disabled={anyBusy}
      >
        {hasWallet
          ? "Prefer a recovery phrase? Set it up →"
          : "Create a new recovery phrase"}
      </button>

      <button
        className="nk-textlink nk-wallet-alt"
        onClick={onImportOpen}
        disabled={anyBusy}
      >
        I already have a recovery phrase →
      </button>

      <PerDeviceApprovalsToggle
        checked={perDeviceApprovals}
        disabled={anyBusy}
        onChange={onPerDeviceApprovalsChange}
      />

      {failed && <p className="nk-error-text">{failed}</p>}
    </Modal>
  );
}

function SettingUpView() {
  return (
    <Modal open onClose={() => undefined} title="Setting up your encrypted space…" isDismissable={false}>
      <p className="nk-muted">One moment — generating your keys on this device.</p>
    </Modal>
  );
}

function SetupErrorView({
  failed,
  onDismiss,
  onRetry,
}: {
  failed: string;
  onDismiss: () => void;
  onRetry: () => void;
}) {
  return (
    <Modal open onClose={() => undefined} title="Couldn't finish setup" isDismissable={false}>
      <p className="nk-error-text">{failed}</p>
      <div className="nk-modal-actions">
        <button className="nk-btn" onClick={onDismiss}>
          Dismiss
        </button>
        <button className="nk-btn nk-btn--primary" onClick={onRetry}>
          Try again
        </button>
      </div>
    </Modal>
  );
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
// eslint-disable-next-line max-lines-per-function -- component manages three vault-root paths (generate/wallet/import) plus error and loading states
export function VaultSetup() {
  const setPhase = useCryptoStore((s) => s.setPhase);
  const setDevice = useCryptoStore((s) => s.setDevice);
  const setError = useCryptoStore((s) => s.setError);
  const setEncryptionRequired = useCryptoStore((s) => s.setEncryptionRequired);
  const setVaultKey = useCryptoStore((s) => s.setVaultKey);
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
  // Opt-in "per-device approvals" (Model B). OFF by default — the global default
  // scheme stays "multi"; this only upgrades THIS vault when the user picks it.
  // A ref mirrors the toggle so the effect-driven `run()` reads the current
  // choice without adding it to the effect deps (which would re-run setup).
  const [perDeviceApprovals, setPerDeviceApprovals] = useState(false);
  const perDeviceApprovalsRef = useRef(false);
  perDeviceApprovalsRef.current = perDeviceApprovals;

  /**
   * Create the vault with the user's chosen trust scheme. Default (toggle off)
   * is the unchanged {@link initVault} path (scheme "multi"); when the user
   * opted into per-device approvals we take the Model B path — envelope scheme
   * plus a genesis roster — via the single core op both surfaces share.
   */
  async function createVault(args: {
    device: DeviceIdentity;
    recoveryRecipient: string;
    recoverySigning: RecoverySigningKey;
  }) {
    const owner = ownerFromAccount();
    if (perDeviceApprovalsRef.current) {
      await initVaultWithPerDeviceApprovals({ ...args, owner });
      return;
    }
    await initVault({ ...args, owner });
  }

  useEffect(() => {
    if (choosing) return; // wait for the user to pick a root
    if (ranRef.current) return;
    ranRef.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps intentionally omitted; effect triggers only on the listed values
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
      await createVault({
        device,
        recoveryRecipient: identity.recipient,
        recoverySigning: signing,
      });
      setDevice(device);
      setEncryptionRequired(true);
      // Envelope vaults: initVault installed the vault key in the seam — mirror
      // it into the store so the UI reflects it without waiting for a reload.
      // No-op for legacy vaults (getActiveVaultKey stays null).
      setVaultKey(getActiveVaultKey());
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
      await createVault({
        device,
        recoveryRecipient: recipient,
        recoverySigning,
      });
      // Cache the phrase locally (marked backed-up — the user already holds it)
      // so the recovery sheet and nudge stay consistent on this device.
      await importRecovery(mnemonic).catch(() => { /* intentional noop — failure to cache locally is non-fatal; the vault is already initialized */ });
      setDevice(device);
      setEncryptionRequired(true);
      // Envelope vaults: initVault installed the vault key in the seam — mirror
      // it into the store so the UI reflects it without waiting for a reload.
      // No-op for legacy vaults (getActiveVaultKey stays null).
      setVaultKey(getActiveVaultKey());
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
      await createVault({
        device,
        recoveryRecipient: recovery.recipient,
        recoverySigning,
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

  if (choosing && !failed) {
    return (
      <>
        <ChoosingView
          walletBusy={walletBusy}
          importBusy={importBusy}
          failed={failed}
          perDeviceApprovals={perDeviceApprovals}
          onWalletRun={() => void runWallet()}
          onChoosePhrase={() => setChoosing(false)}
          onImportOpen={() => setImportOpen(true)}
          onPerDeviceApprovalsChange={setPerDeviceApprovals}
        />
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
      </>
    );
  }

  if (!failed) {
    return <SettingUpView />;
  }

  return (
    <SetupErrorView
      failed={failed}
      onDismiss={() => setError(failed)}
      onRetry={() => {
        ranRef.current = false;
        void run();
      }}
    />
  );
}
