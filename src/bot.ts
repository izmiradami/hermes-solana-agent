import "dotenv/config";
import WebSocket from "ws";
import { Connection, Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { CONFIG } from "./config.js";
import { TokenInfo, Position } from "./types.js";
import { log, printPnL, calcPnL } from "./logger.js";
import { executeBuy, executeSell } from "./trader.js";
import { fetchTokenInfo } from "./pumpApi.js";

function applyFilters(info: TokenInfo): { passed: boolean; reasons: string[] } {
  const f = CONFIG.filters;
  const reasons: string[] = [];
  if (info.volumeUsd < f.minVolumeUsd)
    reasons.push("Volume $" + info.volumeUsd.toFixed(0) + " < $" + f.minVolumeUsd);
  if (info.holderCount < f.minHolders)
    reasons.push("Holder " + info.holderCount + " < " + f.minHolders);
  if (info.devWalletPct > f.maxDevWalletPct)
    reasons.push("Dev %" + info.devWalletPct.toFixed(1) + " > %" + f.maxDevWalletPct);
  if (!info.bondingCurveActive)
    reasons.push("Bonding curve ended");
  const ageMin = (Date.now() - info.createdAt) / 60000;
  if (ageMin > f.maxAgeMinutes)
    reasons.push("Too old: " + ageMin.toFixed(1) + "min");
  return { passed: reasons.length === 0, reasons };
}

interface PendingToken {
  info: TokenInfo;
  timer: ReturnType<typeof setTimeout>;
  buyers: Set<string>;
}

interface LivePosition extends Position {
  currentMarketCapUsd: number;
}

class SmartSniperBot {
  private conn: Connection;
  private wallet: Keypair;
  private ws: WebSocket | null = null;
  private positions = new Map<string, LivePosition>();
  private pending = new Map<string, PendingToken>();
  private running = false;
  private solPriceUsd = 150;

  constructor() {
    if (!CONFIG.privateKey) throw new Error("PRIVATE_KEY missing in .env!");
    this.conn = new Connection(CONFIG.rpcUrl, { commitment: "confirmed" });
    this.wallet = Keypair.fromSecretKey(bs58.decode(CONFIG.privateKey));
  }

  async start() {
    this.running = true;
    const mode = CONFIG.dryRun ? "DRY-RUN" : "LIVE";
    log("INFO", "Smart Sniper started - Mode: " + mode);
    log("INFO", "Wallet: " + this.wallet.publicKey.toBase58());
    log("INFO", "Filters: vol>$" + CONFIG.filters.minVolumeUsd + " | holders>" + CONFIG.filters.minHolders + " | dev<%" + CONFIG.filters.maxDevWalletPct);
    log("INFO", "Trade: " + CONFIG.trade.buyAmountSol + " SOL | TP: %" + CONFIG.trade.takeProfitPct + " | SL: -%" + CONFIG.trade.stopLossPct + " | Max pos: " + CONFIG.trade.maxOpenPositions);

    if (!CONFIG.dryRun) {
      const balance = await this.conn.getBalance(this.wallet.publicKey);
      log("INFO", "Balance: " + (balance / 1e9).toFixed(4) + " SOL");
    }

    this.connect();
    this.startPnLReport();
    this.startPositionMonitor();
  }

  private connect() {
    const ws = new WebSocket("wss://pumpportal.fun/api/data");
    this.ws = ws;

    ws.on("open", () => {
      log("INFO", "WebSocket connected - listening pump.fun...");
      ws.send(JSON.stringify({ method: "subscribeNewToken" }));
    });

    ws.on("message", (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (!msg) return;

        if (msg.txType === "create" && msg.mint) {
          this.onNewToken(msg);
          ws.send(JSON.stringify({ method: "subscribeTokenTrade", keys: [msg.mint] }));
          return;
        }

        if ((msg.txType === "buy" || msg.txType === "sell") && msg.mint) {
          const mint = msg.mint as string;
          const solAmount = (msg.solAmount as number) ?? 0;
          const newMarketCapSol = (msg.marketCapSol as number) ?? 0;

          const pending = this.pending.get(mint);
          if (pending) {
            if (msg.txType === "buy") {
              pending.info.volumeUsd += solAmount * this.solPriceUsd;
              if (msg.traderPublicKey) {
                pending.buyers.add(msg.traderPublicKey as string);
                pending.info.holderCount = pending.buyers.size;
              }
            }
            pending.info.marketCapUsd = newMarketCapSol * this.solPriceUsd;
          }

          const pos = this.positions.get(mint);
          if (pos && newMarketCapSol > 0) {
            pos.currentMarketCapUsd = newMarketCapSol * this.solPriceUsd;
            this.checkPositionTP_SL(mint, pos);
          }
        }
      } catch { }
    });

    ws.on("close", () => {
      log("WARN", "WebSocket closed - reconnecting in 3s...");
      setTimeout(() => this.connect(), 3000);
    });

    ws.on("error", (err: Error) => {
      log("ERROR", "WebSocket error: " + err.message);
    });
  }

  private onNewToken(msg: Record<string, unknown>) {
    const mint = msg.mint as string;
    if (!mint || this.pending.has(mint) || this.positions.has(mint)) return;

    const initialBuySol = (msg.solAmount as number) ?? 0;
    const initialBuyerKey = msg.traderPublicKey as string;
    const buyers = new Set<string>();
    if (initialBuyerKey) buyers.add(initialBuyerKey);

    const info: TokenInfo = {
      mint,
      name: (msg.name as string) ?? "Unknown",
      symbol: (msg.symbol as string) ?? "???",
      marketCapUsd: ((msg.marketCapSol as number) ?? 0) * this.solPriceUsd,
      volumeUsd: initialBuySol * this.solPriceUsd,
      holderCount: buyers.size,
      devWalletPct: 0,
      priceChangePct1m: 0,
      bondingCurveActive: true,
      createdAt: Date.now(),
    };

    log("INFO", "New token: " + info.symbol + " (" + mint.slice(0, 8) + "...) - " + (CONFIG.filters.waitBeforeCheckMs / 1000) + "s until check");

    const timer = setTimeout(() => this.checkAndBuy(mint), CONFIG.filters.waitBeforeCheckMs);
    this.pending.set(mint, { info, timer, buyers });
  }

  private async checkAndBuy(mint: string) {
    const entry = this.pending.get(mint);
    this.pending.delete(mint);
    if (!this.running || !entry) return;

    if (!this.positions.has(mint) && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ method: "unsubscribeTokenTrade", keys: [mint] }));
    }

    const pnl = calcPnL();
    if (pnl.dailyLossSol >= CONFIG.trade.maxDailyLossSol) {
      log("WARN", "Daily loss limit reached - trading stopped");
      return;
    }

    if (this.positions.size >= CONFIG.trade.maxOpenPositions) {
      log("WARN", "Max positions full (" + CONFIG.trade.maxOpenPositions + ") - skipping " + entry.info.symbol);
      return;
    }

    const { info } = entry;
    const result = applyFilters(info);

    if (!result.passed) {
      log("INFO", "SKIP " + info.symbol + " | vol=$" + info.volumeUsd.toFixed(0) + " holder=" + info.holderCount + " - " + result.reasons.join(" | "));
      return;
    }

    log("INFO", "PASS " + info.symbol + " | CA: " + mint + " | vol=$" + info.volumeUsd.toFixed(0) + " holder=" + info.holderCount + " dev=%" + info.devWalletPct.toFixed(1));

    const pos = await executeBuy(this.conn, this.wallet, info);
    if (pos) {
      const livePos: LivePosition = { ...pos, currentMarketCapUsd: info.marketCapUsd };
      this.positions.set(mint, livePos);
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ method: "subscribeTokenTrade", keys: [mint] }));
      }
    }
  }

  private checkPositionTP_SL(mint: string, pos: LivePosition) {
    const entryMarketCap = pos.entryPrice;
    const currentMarketCap = pos.currentMarketCapUsd;
    const pnlPct = ((currentMarketCap - entryMarketCap) / entryMarketCap) * 100;

    if (currentMarketCap > pos.peakPrice) pos.peakPrice = currentMarketCap;
    const drawdown = ((pos.peakPrice - currentMarketCap) / pos.peakPrice) * 100;

    let sellReason: string | null = null;

    if (pnlPct >= CONFIG.trade.takeProfitPct)
      sellReason = "Take Profit +" + pnlPct.toFixed(1) + "%";
    else if (pnlPct <= -CONFIG.trade.stopLossPct)
      sellReason = "Stop Loss " + pnlPct.toFixed(1) + "%";
    else if (drawdown >= CONFIG.trade.trailingStopPct && pnlPct > 0)
      sellReason = "Trailing Stop (from peak -" + drawdown.toFixed(1) + "%)";

    if (sellReason) {
      this.positions.delete(mint);
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ method: "unsubscribeTokenTrade", keys: [mint] }));
      }
      log("INFO", "SELL TRIGGERED: " + pos.symbol + " | " + sellReason + " | PnL: " + (pnlPct >= 0 ? "+" : "") + pnlPct.toFixed(1) + "%");
      executeSell(this.conn, this.wallet, pos, currentMarketCap, sellReason).then(() => {
        this.positions.delete(mint);
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ method: "unsubscribeTokenTrade", keys: [mint] }));
        }
      });
    } else if (Math.random() < 0.01) {
      log("INFO", "POSITION " + pos.symbol + " | PnL: " + (pnlPct >= 0 ? "+" : "") + pnlPct.toFixed(1) + "% | Peak: -" + drawdown.toFixed(1) + "%");
    }
  }

  private startPositionMonitor() {
    setInterval(() => {
      for (const [mint, pos] of this.positions.entries()) {
        if (pos.currentMarketCapUsd > 0) this.checkPositionTP_SL(mint, pos);
      }
    }, 10_000);
  }

  private startPnLReport() {
    setInterval(() => printPnL(), 3 * 60 * 1000);
  }

  async stop() {
    this.running = false;
    for (const e of this.pending.values()) clearTimeout(e.timer);
    printPnL();
    log("INFO", "Bot stopped.");
  }
}

const bot = new SmartSniperBot();
bot.start().catch((err) => { console.error(err); process.exit(1); });
process.on("SIGINT", () => bot.stop().then(() => process.exit(0)));
process.on("SIGTERM", () => bot.stop().then(() => process.exit(0)));
