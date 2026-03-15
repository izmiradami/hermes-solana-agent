import fs   from "fs";
import path from "path";
import { TradeLog, PnLSummary } from "./types.js";
import { CONFIG } from "./config.js";

const RESET  = "\x1b[0m";
const GREEN  = "\x1b[32m";
const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN   = "\x1b[36m";
const GRAY   = "\x1b[90m";
const BOLD   = "\x1b[1m";

function ts() {
  return new Date().toISOString().slice(11, 23);
}

export function log(level: "INFO" | "WARN" | "ERROR" | "TRADE" | "DRY", msg: string) {
  const colors: Record<string, string> = {
    INFO:  CYAN,
    WARN:  YELLOW,
    ERROR: RED,
    TRADE: GREEN,
    DRY:   GRAY,
  };
  let color = colors[level] ?? RESET;
  if (level === "DRY") {
    if (msg.includes("SELL WIN")) color = BOLD + YELLOW;
    else if (msg.includes("SELL LOSS")) color = BOLD + RED;
    else if (msg.includes("BUY simulated")) color = CYAN;
  }
  console.log(`${GRAY}[${ts()}]${RESET} ${color}${BOLD}[${level}]${RESET} ${msg}`);
}

export function writeTrade(entry: TradeLog) {
  try {
    const dir = path.dirname(CONFIG.logFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    let logs: TradeLog[] = [];
    if (fs.existsSync(CONFIG.logFile)) {
      logs = JSON.parse(fs.readFileSync(CONFIG.logFile, "utf8"));
    }
    logs.push(entry);
    fs.writeFileSync(CONFIG.logFile, JSON.stringify(logs, null, 2));
  } catch (err) {
    log("ERROR", `Failed to write log: ${err}`);
  }
}

export function calcPnL(): PnLSummary {
  let logs: TradeLog[] = [];
  try {
    if (fs.existsSync(CONFIG.logFile)) {
      logs = JSON.parse(fs.readFileSync(CONFIG.logFile, "utf8"));
    }
  } catch { }

  const sells = logs.filter((l) => l.type === "SELL" && l.pnlSol !== undefined);
  const today = Date.now() - 24 * 60 * 60 * 1000;
  const todaySells = sells.filter((l) => l.timestamp > today);
  const wins   = sells.filter((l) => (l.pnlSol ?? 0) > 0);
  const losses = sells.filter((l) => (l.pnlSol ?? 0) <= 0);
  const totalPnl  = sells.reduce((s, l) => s + (l.pnlSol ?? 0), 0);
  const dailyLoss = todaySells.filter((l) => (l.pnlSol ?? 0) < 0).reduce((s, l) => s + Math.abs(l.pnlSol ?? 0), 0);
  const pnlPcts   = sells.map((l) => l.pnlPct ?? 0);

  return {
    totalTrades:  sells.length,
    wins:         wins.length,
    losses:       losses.length,
    winRate:      sells.length ? (wins.length / sells.length) * 100 : 0,
    totalPnlSol:  totalPnl,
    bestTrade:    pnlPcts.length ? Math.max(...pnlPcts) : 0,
    worstTrade:   pnlPcts.length ? Math.min(...pnlPcts) : 0,
    avgPnlPct:    pnlPcts.length ? pnlPcts.reduce((a, b) => a + b, 0) / pnlPcts.length : 0,
    dailyLossSol: dailyLoss,
  };
}

export function printPnL() {
  const s = calcPnL();
  const pnlColor = s.totalPnlSol >= 0 ? GREEN : RED;
  const mode     = CONFIG.dryRun ? ` ${GRAY}(DRY-RUN)${RESET}` : "";

  console.log(`
${BOLD}━━━━━━━━━━━━━━━  PnL SUMMARY${mode}  ━━━━━━━━━━━━━━━${RESET}
  Total trades : ${s.totalTrades}
  Win / Loss   : ${GREEN}${s.wins} wins${RESET} / ${RED}${s.losses} losses${RESET}
  Win rate     : ${s.winRate.toFixed(1)}%
  Total PnL    : ${pnlColor}${s.totalPnlSol >= 0 ? "+" : ""}${s.totalPnlSol.toFixed(4)} SOL${RESET}
  Best trade   : ${GREEN}+${s.bestTrade.toFixed(1)}%${RESET}
  Worst trade  : ${RED}${s.worstTrade.toFixed(1)}%${RESET}
  Avg PnL      : ${s.avgPnlPct >= 0 ? GREEN : RED}${s.avgPnlPct.toFixed(1)}%${RESET}
  Daily loss   : ${s.dailyLossSol.toFixed(4)} SOL / ${CONFIG.trade.maxDailyLossSol} SOL limit
${"━".repeat(44)}`);
}
