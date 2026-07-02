// Wallet layer: connect Freighter (and other Stellar wallets) via Stellar
// Wallets Kit, expose the address and a signXdr() the soroban layer can call.
import {
  StellarWalletsKit,
  WalletNetwork,
  FreighterModule,
  xBullModule,
  FREIGHTER_ID,
} from "@creit.tech/stellar-wallets-kit";

let kit = null;
let address = null;

function getKit() {
  if (!kit) {
    kit = new StellarWalletsKit({
      network: WalletNetwork.TESTNET,
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
    k.openModal({
      onWalletSelected: async (option) => {
        try {
          k.setWallet(option.id);
          const res = await k.getAddress();
          address = res.address;
          resolve(address);
        } catch (e) {
          reject(e);
        }
      },
      onClosed: (err) => reject(err || new Error("wallet selection cancelled")),
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
    networkPassphrase: WalletNetwork.TESTNET,
  });
  return signedTxXdr;
}
