// The strategy format every bot is written in. The AI compiles plain English
// into this shape, and the engine executes it. It is data, never code, so a
// strategy can't do anything except buy and sell on paper.
import { z } from "zod";

export const ASSETS = ["BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "AVAX", "LINK", "LTC", "DOT"];

export const ASSET_NAMES = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  SOL: "Solana",
  XRP: "XRP",
  DOGE: "Dogecoin",
  ADA: "Cardano",
  AVAX: "Avalanche",
  LINK: "Chainlink",
  LTC: "Litecoin",
  DOT: "Polkadot",
};

export const INDICATORS = ["change_pct", "price_vs_sma", "sma_cross", "rsi", "drawdown_from_high", "volatility"];

export const ConditionSchema = z.object({
  indicator: z.enum(INDICATORS),
  period: z.number().int().describe("Lookback window in days"),
  period2: z.number().int().nullable().describe("Slow average window for sma_cross; null otherwise"),
  op: z.enum(["above", "below"]),
  value: z.number().describe("Threshold, in percent (RSI: 0-100)"),
});

export const StrategySchema = z.object({
  name: z.string().describe("Catchy 1-3 word bot name"),
  summary: z.string().describe("One plain-English sentence describing the strategy"),
  assets: z.array(z.enum(ASSETS)).describe("Coins the bot may trade"),
  entry: z.array(ConditionSchema).describe("Buy a coin when ALL of these are true. Empty = buy right away"),
  exit: z.array(ConditionSchema).describe("Sell a coin when ANY of these is true"),
  rank_by_momentum: z
    .object({ period: z.number().int(), top_n: z.number().int() })
    .nullable()
    .describe("Only buy the top_n coins by price change over period days; null to skip"),
  position_size_pct: z.number().describe("Percent of total account value put into each buy"),
  max_positions: z.number().int().describe("Maximum coins held at once"),
  stop_loss_pct: z.number().nullable().describe("Sell if a position falls this % below its buy price"),
  take_profit_pct: z.number().nullable().describe("Sell if a position rises this % above its buy price"),
});

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const clampInt = (n, lo, hi) => clamp(Math.round(n), lo, hi);

function cleanCondition(c) {
  const out = {
    indicator: c.indicator,
    period: clampInt(c.period, 1, 200),
    period2: null,
    op: c.op,
    value: clamp(c.value, -1000, 1000),
  };
  if (c.indicator === "sma_cross") {
    out.period = Math.max(out.period, 2);
    out.period2 = clampInt(c.period2 ?? out.period * 4, 2, 400);
    if (out.period2 <= out.period) out.period2 = Math.min(400, out.period * 2);
  }
  if (c.indicator === "rsi") {
    out.period = Math.max(out.period, 2);
    out.value = clamp(out.value, 0, 100);
  }
  if (c.indicator === "price_vs_sma" || c.indicator === "volatility") out.period = Math.max(out.period, 2);
  return out;
}

// Validates any strategy (from the AI or a browser) and clamps it to safe ranges.
export function sanitizeStrategy(input) {
  const s = StrategySchema.parse(input);
  const assets = [...new Set(s.assets)];
  return {
    name: s.name.trim().slice(0, 40) || "Unnamed Bot",
    summary: s.summary.trim().slice(0, 240),
    assets: assets.length ? assets : ["BTC"],
    entry: s.entry.slice(0, 4).map(cleanCondition),
    exit: s.exit.slice(0, 4).map(cleanCondition),
    rank_by_momentum: s.rank_by_momentum
      ? {
          period: clampInt(s.rank_by_momentum.period, 2, 200),
          top_n: clampInt(s.rank_by_momentum.top_n, 1, Math.max(1, assets.length)),
        }
      : null,
    position_size_pct: clamp(s.position_size_pct, 1, 100),
    max_positions: clampInt(s.max_positions, 1, 10),
    stop_loss_pct: s.stop_loss_pct == null ? null : clamp(s.stop_loss_pct, 0.5, 95),
    take_profit_pct: s.take_profit_pct == null ? null : clamp(s.take_profit_pct, 0.5, 10000),
  };
}

// One-click starting points shown on the home page.
export const TEMPLATES = [
  { label: "🩸 Buy the dip", text: "Buy Bitcoin or Ethereum when it drops more than 10% in a week. Sell when it's up 15% or if it falls another 10%." },
  { label: "📈 Trend rider", text: "Buy any coin trading above its 50-day moving average and sell when it falls below it. Put 20% in each coin." },
  { label: "🚀 Momentum top 3", text: "Every day buy the 3 best performing coins over the last 30 days. Sell a coin when its 30-day gain turns negative or it loses 12%." },
  { label: "🎯 RSI sniper", text: "Buy Solana, Ethereum or Avalanche when RSI drops below 30 and sell when RSI goes above 65." },
  { label: "💎 Diamond hands", text: "Buy and hold Bitcoin and Ethereum forever. Never sell." },
  { label: "✂️ Golden cross", text: "Buy Bitcoin when the 20-day average crosses above the 100-day average, sell when it crosses back below. Stop loss 8%." },
];
