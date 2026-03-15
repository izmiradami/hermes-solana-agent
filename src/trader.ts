import "dotenv/config";
import { Connection, Keypair, VersionedTransaction, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { CONFIG, JUPITER_QUOTE, SOL_MINT } from "./config.js";
import { TokenInfo, Position, TradeLog } from "./types.js";
import { log, writeTrade } from "./logger.js";

export async function executeBuy(connection: Connection, wallet: Keypair, info: TokenInfo): Promise<Position | null> {
  const amountLamports = Math.floor(CONFIG.trade.buyAmountSol * LAMPORTS_PER_SOL);
  const currentPrice   = info.marketCapUsd;

  if (CONFIG.dryRun) {
    const pos: Position = {
      mint: info.mint, symbol: info.symbol, entryPrice: currentPrice,
      peakPrice: currentPrice, amountSol: CONFIG.trade.buyAmountSol,
      openedAt: Date.now(), txSignature: "DRY_RUN_" + Date.now(),
    };
    writeTrade({ type: "BUY", mint: info.mint, symbol: info.symbol,
      amountSol: CONFIG.trade.buyAmountSol, priceUsd: info.marketCapUsd,
      reason: "Filter passed", timestamp: Date.now(), dryRun: true });
    log("DRY", `[DRY-RUN] BUY simulated: ${info.symbol} | Market cap: $${info.marketCapUsd.toLocaleString()} | ${CONFIG.trade.buyAmountSol} SOL`);
    return pos;
  }

  try {
    log("INFO", `Getting Jupiter quote: ${info.symbol}...`);
    const quoteRes = await fetch(
      `${JUPITER_QUOTE}/quote?inputMint=${SOL_MINT}&outputMint=${info.mint}&amount=${amountLamports}&slippageBps=${CONFIG.trade.slippageBps}`
    );
    const quote = await quoteRes.json();
    if (quote.error) throw new Error(`Quote error: ${quote.error}`);

    const swapRes = await fetch(`${JUPITER_QUOTE}/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quote, userPublicKey: wallet.publicKey.toBase58(),
        wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: CONFIG.trade.priorityFeeLamports,
      }),
    });
    const { swapTransaction } = await swapRes.json();
    const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, "base64"));
    tx.sign([wallet]);

    const sig = await connection.sendTransaction(tx, { skipPreflight: true, maxRetries: 3 });
    await connection.confirmTransaction(sig, "confirmed");

    const pos: Position = {
      mint: info.mint, symbol: info.symbol, entryPrice: currentPrice,
      peakPrice: currentPrice, amountSol: CONFIG.trade.buyAmountSol,
      openedAt: Date.now(), txSignature: sig,
    };
    writeTrade({ type: "BUY", mint: info.mint, symbol: info.symbol,
      amountSol: CONFIG.trade.buyAmountSol, priceUsd: info.marketCapUsd,
      reason: "Filter passed", timestamp: Date.now(), dryRun: false, txSignature: sig });
    log("TRADE", `BUY: ${info.symbol} | ${CONFIG.trade.buyAmountSol} SOL | TX: ${sig}`);
    return pos;
  } catch (err) {
    log("ERROR", `Buy failed (${info.symbol}): ${err}`);
    return null;
  }
}

export async function executeSell(connection: Connection, wallet: Keypair, pos: Position, currentPriceUsd: number, reason: string): Promise<void> {
  const pnlPct = ((currentPriceUsd - pos.entryPrice) / pos.entryPrice) * 100;
  const pnlSol = pos.amountSol * (pnlPct / 100);

  if (CONFIG.dryRun) {
    writeTrade({ type: "SELL", mint: pos.mint, symbol: pos.symbol,
      amountSol: pos.amountSol, priceUsd: currentPriceUsd,
      pnlPct, pnlSol, reason, timestamp: Date.now(), dryRun: true });
    const icon = pnlSol >= 0 ? "WIN" : "LOSS";
    log("DRY", `[DRY-RUN] SELL ${icon}: ${pos.symbol} | ${reason} | PnL: ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}% (${pnlSol >= 0 ? "+" : ""}${pnlSol.toFixed(4)} SOL)`);
    return;
  }

  try {
    await new Promise(r => setTimeout(r, 5000));
    const ata = await getAssociatedTokenAddress(new PublicKey(pos.mint), wallet.publicKey);
    const balance = await connection.getTokenAccountBalance(ata, "confirmed");
    const amount = balance.value.amount;
    if (amount === "0") { log("WARN", `${pos.symbol} zero balance, skipping sell`); return; }

    const quoteRes = await fetch(
      `${JUPITER_QUOTE}/quote?inputMint=${pos.mint}&outputMint=${SOL_MINT}&amount=${amount}&slippageBps=${CONFIG.trade.slippageBps}`
    );
    const quote = await quoteRes.json();
    if (quote.error) throw new Error(quote.error);

    const swapRes = await fetch(`${JUPITER_QUOTE}/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quote, userPublicKey: wallet.publicKey.toBase58(),
        wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: CONFIG.trade.priorityFeeLamports,
      }),
    });
    const { swapTransaction } = await swapRes.json();
    const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, "base64"));
    tx.sign([wallet]);

    const sig = await connection.sendTransaction(tx, { skipPreflight: true, maxRetries: 3 });
    await connection.confirmTransaction(sig, "confirmed");

    writeTrade({ type: "SELL", mint: pos.mint, symbol: pos.symbol,
      amountSol: pos.amountSol, priceUsd: currentPriceUsd,
      pnlPct, pnlSol, reason, timestamp: Date.now(), dryRun: false, txSignature: sig });

    const icon = pnlSol >= 0 ? "WIN" : "LOSS";
    log("TRADE", `SELL ${icon}: ${pos.symbol} | ${reason} | PnL: ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}% | TX: ${sig}`);
  } catch (err) {
    log("ERROR", `Sell failed (${pos.symbol}): ${err}`);
  }
}
