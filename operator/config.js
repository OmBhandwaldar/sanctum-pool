// Deployed testnet contracts + pool parameters. Update after redeploying
// (see deployments/). The ASP root watcher/operator posts state + ASP roots.
export const CONFIG = {
  verifier: "CABTLTW2QAFBU674HZIDQDSWE5YAK3UL675L5QS3IOKA4VIR7FOE2VDC",
  pool: "CB5YM3AXTU3KGUYWL7RRN7QZ4TE7SGNS2VJS6SIT4PKSS72Y426UCUB5",
  token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC", // native XLM SAC (testnet)
  denomAmount: 1000000n, // stroops moved per note (0.1 XLM)
  denomLabel: "0.1 XLM",
  scope: 1n,
  explorerTx: (h) => `https://stellar.expert/explorer/testnet/tx/${h}`,
};
