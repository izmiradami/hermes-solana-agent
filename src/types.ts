export interface TokenInfo {
  mint:               string;
  name:               string;
  symbol:             string;
  marketCapUsd:       number;
  volumeUsd:          number;
  holderCount:        number;
  devWalletPct:       number;
  priceChangePct1m:   number;
  bondingCurveActive: boolean;
  createdAt:          number;
}

export interface Position {
  mint:        string;
  symbol:      string;
  entryPrice:  number;
  peakPrice:   number;
  amountSol:   number;
  openedAt:    number;
  txSignature: string;
}

export interface TradeLog {
  type:        "BUY" | "SELL" | "SKIP";
  mint:        string;
  symbol:      string;
  amountSol:   number;
  priceUsd:    number;
  pnlPct?:     number;
  pnlSol?:     number;
  reason:      string;
  timestamp:   number;
  dryRun:      boolean;
  txSignature?: string;
}

export interface PnLSummary {
  totalTrades:   number;
  wins:          number;
  losses:        number;
  winRate:       number;
  totalPnlSol:   number;
  bestTrade:     number;
  worstTrade:    number;
  avgPnlPct:     number;
  dailyLossSol:  number;
}

export type FilterResult =
  | { passed: true }
  | { passed: false; reasons: string[] };
