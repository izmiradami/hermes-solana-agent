import { TokenInfo, FilterResult } from "./types.js";
import { CONFIG } from "./config.js";

export function applyFilters(info: TokenInfo): FilterResult {
  const f = CONFIG.filters;
  const reasons: string[] = [];

  if (info.volumeUsd < f.minVolumeUsd)
    reasons.push(`Volume $${info.volumeUsd.toFixed(0)} < $${f.minVolumeUsd}`);

  if (info.holderCount < f.minHolders)
    reasons.push(`Holder ${info.holderCount} < ${f.minHolders}`);

  if (info.devWalletPct > f.maxDevWalletPct)
    reasons.push(`Dev wallet %${info.devWalletPct.toFixed(1)} > %${f.maxDevWalletPct}`);

  if (f.requireBondingCurve && !info.bondingCurveActive)
    reasons.push("Bonding curve ended (moved to Raydium)");

  const ageMin = (Date.now() - info.createdAt) / 60_000;
  if (ageMin > f.maxAgeMinutes)
    reasons.push(`Too old: ${ageMin.toFixed(1)}min (max ${f.maxAgeMinutes}min)`);

  return reasons.length === 0 ? { passed: true } : { passed: false, reasons };
}
