// Soroban contract layer: read views via simulation, and submit signed
// invocations (deposit/withdraw) built by stellar-sdk and signed by the wallet.
import {
  rpc,
  TransactionBuilder,
  Contract,
  Address,
  Account,
  Keypair,
  nativeToScVal,
  scValToNative,
  xdr,
  Networks,
  BASE_FEE,
} from "@stellar/stellar-sdk";

export const RPC_URL = "https://soroban-testnet.stellar.org";
export const NETWORK = Networks.TESTNET;
export const server = new rpc.Server(RPC_URL);

// ---- ScVal helpers ----
export const u256 = (v) => nativeToScVal(BigInt(v), { type: "u256" });
export const addr = (s) => new Address(s).toScVal();
export const bytesHex = (hex) =>
  xdr.ScVal.scvBytes(Buffer.from(hex.replace(/^0x/, ""), "hex"));
export const i128 = (v) => nativeToScVal(BigInt(v), { type: "i128" });

// ---- reads (simulate only; no signature needed) ----
async function readSource() {
  // simulate needs a source account object; a random keypair is fine for reads.
  return new Account(Keypair.random().publicKey(), "0");
}

export async function readView(contractId, method, args = []) {
  const src = await readSource();
  const tx = new TransactionBuilder(src, { fee: BASE_FEE, networkPassphrase: NETWORK })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
  return scValToNative(sim.result.retval);
}

export const getCommitments = (pool) => readView(pool, "commitments");
export const isKnownRoot = (pool, root) => readView(pool, "is_known_root", [u256(root)]);
export const isKnownAspRoot = (pool, root) => readView(pool, "is_known_asp_root", [u256(root)]);
export const isSpent = (pool, nh) => readView(pool, "is_spent", [u256(nh)]);
export const getEncNote = (pool, commitment) => readView(pool, "get_enc_note", [u256(commitment)]);
export const tokenBalance = (token, address) => readView(token, "balance", [addr(address)]);

// ---- writes (build → prepare(sim footprint) → wallet-sign → submit → poll) ----
// signXdr: (xdrBase64) => Promise<signedXdrBase64>
export async function invoke({ contractId, method, args = [], source, signXdr }) {
  const account = await server.getAccount(source);
  let tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(60)
    .build();

  tx = await server.prepareTransaction(tx); // assembles Soroban footprint via simulation
  const signed = await signXdr(tx.toXDR());
  const signedTx = TransactionBuilder.fromXDR(signed, NETWORK);

  const sent = await server.sendTransaction(signedTx);
  if (sent.status === "ERROR") throw new Error("submit failed: " + JSON.stringify(sent.errorResult));

  let got = await server.getTransaction(sent.hash);
  while (got.status === "NOT_FOUND") {
    await new Promise((r) => setTimeout(r, 1500));
    got = await server.getTransaction(sent.hash);
  }
  if (got.status !== "SUCCESS") throw new Error("tx failed: " + got.status);
  return { hash: sent.hash, returnValue: got.returnValue ? scValToNative(got.returnValue) : null };
}
