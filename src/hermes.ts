import { TokenInfo } from "./types.js";

const NOUS_API_KEY = process.env.NOUS_API_KEY ?? "";
const NOUS_API_URL = "https://inference-api.nousresearch.com/v1/chat/completions";

export async function hermesDecide(info: TokenInfo): Promise<{ decision: "BUY" | "SKIP"; reason: string }> {
  try {
    const prompt = `You are a Solana pump.fun token trading expert. Analyze this token and decide if it's worth buying.

Token Data:
- Symbol: ${info.symbol}
- Market Cap: $${info.marketCapUsd.toLocaleString()}
- Volume (3min): $${info.volumeUsd.toFixed(0)}
- Holders: ${info.holderCount}
- Dev Wallet: ${info.devWalletPct.toFixed(1)}%
- Bonding Curve Active: ${info.bondingCurveActive}
- Age: ${((Date.now() - info.createdAt) / 60000).toFixed(1)} minutes

Rules:
- BUY if: strong momentum, good holder count, low dev wallet, active bonding curve
- SKIP if: suspicious activity, high dev wallet, low volume, or risky signals

Respond with EXACTLY this format:
DECISION: BUY or SKIP
REASON: one sentence explanation`;

    const res = await fetch(NOUS_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${NOUS_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "Hermes-4-70B",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 100,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) throw new Error(`Hermes API error: ${res.status}`);

    const data = await res.json();
    const content = data.choices[0]?.message?.content ?? "";

    const decisionMatch = content.match(/DECISION:\s*(BUY|SKIP)/i);
    const reasonMatch = content.match(/REASON:\s*(.+)/i);

    const decision = (decisionMatch?.[1]?.toUpperCase() as "BUY" | "SKIP") ?? "BUY";
    const reason = reasonMatch?.[1]?.trim() ?? "No reason provided";

    return { decision, reason };
  } catch (err) {
    return { decision: "BUY", reason: `Hermes unavailable, proceeding: ${err}` };
  }
}
