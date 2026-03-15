# 🤖 Hermes Solana Agent

An autonomous AI-powered trading agent for Solana's [pump.fun](https://pump.fun) platform, powered by **Hermes-4-70B** from [NousResearch](https://nousresearch.com).

## 🧠 How Hermes AI Works

Every token that passes the initial filters is sent to **Hermes-4-70B** for analysis. Hermes evaluates the token data and makes a **BUY or SKIP** decision with a reasoning explanation.

```
New Token Detected
       ↓
Wait 3 minutes (monitor volume & holders)
       ↓
Apply Smart Filters (volume, holders, dev%, age)
       ↓
🧠 Ask Hermes-4-70B AI
       ↓
Hermes: BUY or SKIP + reasoning
       ↓
Execute trade via Jupiter Aggregator
       ↓
Monitor position → TP/SL/Trailing Stop → Sell
```

### Example Hermes Decisions

```
[INFO] PASS CIRBP | vol=$2319 holder=124 dev=%0.0
[INFO] Asking Hermes AI...
[INFO] Hermes: BUY | Strong momentum with high volume, good holder count, low dev wallet, and active bonding curve.
[DRY] BUY simulated: CIRBP | Market cap: $4,307 | 0.05 SOL
...
[INFO] SELL WIN: CIRBP | Take Profit +101.7% | PnL: +101.7% (+0.0509 SOL) ✅
```

```
[INFO] PASS KIRKAINATOR | vol=$17213 holder=197 dev=%0.0
[INFO] Asking Hermes AI...
[INFO] Hermes: SKIP | Token is too new with only 3 minutes of age, making it highly risky.
[INFO] HERMES SKIP KIRKAINATOR
```

## ✨ Features

- **Real-time Detection** — WebSocket monitoring of pump.fun for new token launches
- **Smart Pre-filters** — Volume, holder count, dev wallet %, bonding curve & age filters
- **Hermes AI Layer** — Every trade decision reviewed by Hermes-4-70B
- **Auto Buy/Sell** — Executes trades via Jupiter Aggregator on Solana
- **Take Profit / Stop Loss** — Configurable TP, SL, and Trailing Stop
- **Dry-Run Mode** — Simulate trades without real money
- **PnL Reporting** — Real-time profit/loss tracking every 3 minutes
- **Daily Loss Limit** — Auto-stops trading when daily loss limit is reached

## 📊 Dry-Run Performance

| Metric | Result |
|--------|--------|
| Win Rate | 76% |
| Best Trade | +118.2% |
| Avg Trade | +14.3% |
| Daily PnL | +2.17 SOL |

## 🛠️ Tech Stack

- **AI**: Hermes-4-70B by NousResearch
- **Runtime**: Node.js v22 + TypeScript
- **Blockchain**: Solana Web3.js
- **DEX**: Jupiter Aggregator v6
- **Data Feed**: PumpPortal WebSocket
- **Process Manager**: PM2

## ⚙️ Configuration

```typescript
filters: {
  minVolumeUsd:        500,    // Minimum $500 volume
  minHolders:            5,    // Minimum 5 holders
  maxDevWalletPct:      15,    // Dev wallet max 15%
  maxAgeMinutes:         5,    // Token max 5 minutes old
  waitBeforeCheckMs: 180000,   // Wait 3min before checking
},
trade: {
  buyAmountSol:       0.05,    // 0.05 SOL per trade
  takeProfitPct:       100,    // Take profit at +100%
  stopLossPct:          25,    // Stop loss at -25%
  trailingStopPct:      20,    // Trailing stop -20% from peak
  maxOpenPositions:      5,    // Max 5 simultaneous positions
  maxDailyLossSol:     0.5,    // Daily loss limit 0.5 SOL
}
```

## 🚀 Quick Start

### Prerequisites
- Node.js v18+
- Solana wallet with SOL
- Helius RPC API key ([helius.dev](https://helius.dev))
- Nous Portal API key ([portal.nousresearch.com](https://portal.nousresearch.com))

### Installation

```bash
git clone https://github.com/izmiradami/hermes-solana-agent
cd hermes-solana-agent
npm install
```

### Environment Setup

Create a `.env` file:

```env
PRIVATE_KEY=your_wallet_private_key_base58
RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
NOUS_API_KEY=your_nous_portal_api_key
```

### Run

```bash
# Dry-run mode (simulated trades - safe for testing)
npm run dry

# Live mode (real trades!)
npm run live
```

### Production (PM2)

```bash
npm install -g pm2
pm2 start "npm run live" --name hermes-agent
pm2 logs hermes-agent
```

## 🏆 NousResearch Hermes Agent Hackathon

This project was built for the **NousResearch Hermes Agent Hackathon** (March 2026).

**Unique angle:** Hermes-4-70B making real Solana DeFi trade decisions autonomously — AI that doesn't just chat, but acts with real financial consequences.

## ⚠️ Disclaimer

This bot is for educational purposes. Crypto trading involves significant risk. Never invest more than you can afford to lose.

## 📄 License

MIT License

## 📱 Telegram Integration (Coming Soon)

This is a demo version. A full Telegram integration can be added to receive real-time notifications for every trade:

- 🟢 **BUY alert** — Token name, market cap, Hermes AI reasoning
- 🔴 **SELL alert** — PnL result, win/loss, reason (TP/SL/Trailing Stop)
- 📊 **PnL summary** — Periodic profit/loss reports sent directly to your Telegram

To enable, add your `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` to the `.env` file.
