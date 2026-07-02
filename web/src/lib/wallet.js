// Wallet layer for Stellar Wallets Kit v2.5 (fully static API): init once,
// authModal() opens the picker and resolves to the address, signTransaction()
// signs. Exposes the address + a signXdr() the soroban layer calls.
import { StellarWalletsKit, Networks } from "@creit.tech/stellar-wallets-kit";
import { FreighterModule } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { xBullModule } from "@creit.tech/stellar-wallets-kit/modules/xbull";

const TESTNET = Networks.TESTNET;
let initialized = false;
let address = null;

function ensureInit() {
  if (!initialized) {
    StellarWalletsKit.init({
      network: TESTNET,
      modules: [new FreighterModule(), new xBullModule()],
    });
    initialized = true;
  }
}

export function getAddress() {
  return address;
}

// Opens the wallet picker; resolves to the connected address.
export async function connect() {
  ensureInit();
  const { address: a } = await StellarWalletsKit.authModal();
  address = a;
  return address;
}

export async function disconnect() {
  try {
    await StellarWalletsKit.disconnect();
  } catch {}
  address = null;
}

// Sign a base64 transaction XDR; returns the signed XDR (for soroban.invoke).
export async function signXdr(xdrBase64) {
  if (!address) throw new Error("wallet not connected");
  ensureInit();
  const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdrBase64, {
    address,
    networkPassphrase: TESTNET,
  });
  return signedTxXdr;
}
