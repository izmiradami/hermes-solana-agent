import "dotenv/config";

export const CONFIG = {
  rpcUrl: process.env.RPC_URL ?? "https://mainnet.helius-rpc.com/?api-key=YOUR_KEY",
  wsUrl:  process.env.WS_URL  ?? "wss://mainnet.helius-rpc.com/?api-key=YOUR_KEY",
  privateKey: process.env.PRIVATE_KEY ?? "",
  dryRun: process.env.DRY_RUN !== "false",
  filters: {
    minVolumeUsd:        500,
    minHolders:            5,
    maxDevWalletPct:      15,
    minPriceChangePct1m:  15,
    requireBondingCurve: true,
    maxAgeMinutes:         5,
    waitBeforeCheckMs: 180000,
  },
  trade: {
    buyAmountSol:        0.05,
    takeProfitPct:        100,
    stopLossPct:           25,
    trailingStopPct:       20,
    slippageBps:          500,
    maxOpenPositions:       5,
    maxDailyLossSol:      0.5,
    priorityFeeLamports: 100000,
  },
  logFile: "./logs/trades.json",
};

export const PUMP_FUN_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBymFf38";
export const SOL_MINT         = "So11111111111111111111111111111111111111112";
export const JUPITER_QUOTE    = "https://lite-api.jup.ag/swap/v1";
export const JUPITER_API_KEY  = process.env.JUPITER_API_KEY ?? "";
export const PUMP_API         = "https://frontend-api.pump.fun";
