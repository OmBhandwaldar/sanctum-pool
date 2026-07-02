// Wallet layer: connect Freighter (and other Stellar wallets) via Stellar
// Wallets Kit, expose the address and a signXdr() the soroban layer can call.
import { StellarWalletsKit, Networks } from "@creit.tech/stellar-wallets-kit";
import { FreighterModule, FREIGHTER_ID } from "@creit.tech/stellar-wallets-kit/modules/freighter";
import { xBullModule } from "@creit.tech/stellar-wallets-kit/modules/xbull";

const TESTNET = Networks.TESTNET;
let kit = null;
let address = null;

function getKit() {
  if (!kit) {
    kit = new StellarWalletsKit({
      network: TESTNET,
      selectedWalletId: FREIGHTER_ID,
      modules: [new FreighterModule(), new xBullModule()],
    });
  }
  return kit;
}

export function getAddress() {
  return address;
}

// Opens the wallet picker; resolves to the connected address.
export async function connect() {
  const k = getKit();
  return new Promise((resolve, reject) => {
    let selected = false;
    k.openModal({
      onWalletSelected: async (option) => {
        selected = true; // the modal closes right after selection; don't let
        try {            // onClosed reject the still-pending async getAddress.
          await k.setWallet(option.id);
          const res = await k.getAddress();
          address = res.address;
          resolve(address);
        } catch (e) {
          reject(new Error(e?.message || "could not get address from wallet"));
        }
      },
      onClosed: () => {
        if (!selected) reject(new Error("cancelled"));
      },
    });
  });
}

export function disconnect() {
  address = null;
}

// Sign a base64 transaction XDR; returns the signed XDR (for soroban.invoke).
export async function signXdr(xdrBase64) {
  if (!address) throw new Error("wallet not connected");
  const { signedTxXdr } = await getKit().signTransaction(xdrBase64, {
    address,
    networkPassphrase: TESTNET,
  });
  return signedTxXdr;
}
