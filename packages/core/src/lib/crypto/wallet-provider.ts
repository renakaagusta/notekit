/**
 * Thin EIP-1193 bridge for wallet unlock. Connects an injected EVM wallet
 * (MetaMask, Rabby, Coinbase, Trust, Phantom-in-EVM-mode) and produces a
 * {@link WalletSigner} for wallet-key.ts. No chain calls, no transactions —
 * connect + personal_sign only. WalletConnect is a future addition behind the
 * same {@link WalletConnection} shape.
 */
import { bytesToHex } from "@noble/hashes/utils.js";
import type { WalletSigner } from "./wallet-key";

/** Minimal EIP-1193 surface we depend on. */
interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  isMetaMask?: boolean;
  isRabby?: boolean;
  isCoinbaseWallet?: boolean;
  providers?: Eip1193Provider[];
}

export interface WalletConnection {
  /** Checksummed EVM address of the connected account. */
  address: string;
  /** Best-effort human label of the wallet app (for display only). */
  walletName: string;
  /** personal_sign bound to the connected account. */
  sign: WalletSigner;
}

function getInjectedProvider(): Eip1193Provider | null {
  const eth = (globalThis as { ethereum?: Eip1193Provider }).ethereum;
  if (!eth) return null;
  // Multiple wallets injected: prefer MetaMask, else the first.
  if (Array.isArray(eth.providers) && eth.providers.length > 0) {
    return eth.providers.find((p) => p.isMetaMask) ?? eth.providers[0] ?? null;
  }
  return eth;
}

/** Stable id for the detected wallet — drives both the label and the logo. */
export type WalletId = "metamask" | "rabby" | "coinbase" | "wallet";

function idFor(p: Eip1193Provider): WalletId {
  // Rabby sets `isMetaMask` too for dApp compatibility, so check it first.
  if (p.isRabby) return "rabby";
  if (p.isMetaMask) return "metamask";
  if (p.isCoinbaseWallet) return "coinbase";
  return "wallet";
}

const WALLET_NAMES: Record<WalletId, string> = {
  metamask: "MetaMask",
  rabby: "Rabby",
  coinbase: "Coinbase Wallet",
  wallet: "Wallet",
};

function labelFor(p: Eip1193Provider): string {
  return WALLET_NAMES[idFor(p)];
}

/** True if an injected EVM wallet is present — gate the "Connect wallet" UI. */
export function hasInjectedWallet(): boolean {
  return getInjectedProvider() !== null;
}

/**
 * The injected wallet's `{ id, name }`, or `null` if none — lets the UI show
 * the right logo and a "Continue with MetaMask"-style label. Falls back to the
 * generic `wallet` id for any EIP-1193 provider we don't brand.
 */
export function detectedWallet(): { id: WalletId; name: string } | null {
  const p = getInjectedProvider();
  if (!p) return null;
  const id = idFor(p);
  return { id, name: WALLET_NAMES[id] };
}

/** UTF-8 → 0x-prefixed hex, the safe encoding for personal_sign messages. */
function toHexMessage(message: string): string {
  return "0x" + bytesToHex(new TextEncoder().encode(message));
}

/**
 * Prompt the user to connect their wallet and return a connection whose `sign`
 * issues a personal_sign over a given message with the connected account.
 * Throws if no wallet is present or the user rejects the connection.
 */
export async function connectWallet(): Promise<WalletConnection> {
  const provider = getInjectedProvider();
  if (!provider) {
    throw new Error("No EVM wallet found. Install MetaMask or another wallet.");
  }

  const accounts = (await provider.request({
    method: "eth_requestAccounts",
  })) as string[];
  const address = accounts?.[0];
  if (!address) {
    throw new Error("No account selected in wallet");
  }

  const sign: WalletSigner = async (message: string) => {
    const signature = (await provider.request({
      method: "personal_sign",
      params: [toHexMessage(message), address],
    })) as string;
    return signature;
  };

  return { address, walletName: labelFor(provider), sign };
}
