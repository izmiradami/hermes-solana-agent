import { Connection, PublicKey } from "@solana/web3.js";
import { TokenInfo } from "./types.js";
import { PUMP_API, PUMP_FUN_PROGRAM } from "./config.js";
import { log } from "./logger.js";

export async function fetchTokenInfo(mint: string): Promise<TokenInfo | null> {
  try {
    const res = await fetch(`${PUMP_API}/coins/${mint}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const d = await res.json();
    if (!d || d.statusCode === 404) return null;

    const topHolderPct = d.top_holders?.[0]?.percentage ?? 0;

    return {
      mint,
      name:               d.name      ?? "Unknown",
      symbol:             d.symbol    ?? "???",
      marketCapUsd:       d.usd_market_cap  ?? 0,
      volumeUsd:          d.volume          ?? 0,
      holderCount:        d.holder_count    ?? 0,
      devWalletPct:       topHolderPct,
      priceChangePct1m:   d.price_change_percent1m ?? 0,
      bondingCurveActive: !d.complete,
      createdAt:          d.created_timestamp ? d.created_timestamp * 1000 : Date.now(),
    };
  } catch (err) {
    log("WARN", `fetchTokenInfo error (${mint.slice(0, 8)}...): ${err}`);
    return null;
  }
}

export async function getHolderCount(connection: Connection, mint: string): Promise<number> {
  try {
    const mintPk = new PublicKey(mint);
    const accounts = await connection.getTokenLargestAccounts(mintPk, "confirmed");
    return accounts.value.filter((a) => a.uiAmount && a.uiAmount > 0).length;
  } catch {
    return 0;
  }
}
