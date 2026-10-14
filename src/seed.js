// Sample bots so a fresh league isn't empty. Every one is flagged `sample: true`
// and labeled "Sample" in the app.
import crypto from "node:crypto";
import { sanitizeStrategy } from "./strategy.js";

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const c = (indicator, period, op, value, period2 = null) => ({ indicator, period, period2, op, value });
const ALL = ["BTC", "ETH", "SOL", "XRP", "DOGE", "ADA", "AVAX", "LINK", "LTC", "DOT"];

const SAMPLES = [
  {
    creator: "quantqueen",
    joined: 90,
    hype: 41,
    prompt: "Every day hold the 3 best performing coins over the last 30 days, as long as they're up. Sell a coin when its 30-day gain turns negative or it loses 12%.",
    strategy: { name: "Momentum Machine", summary: "Rides the 3 hottest coins of the month.", assets: ALL, entry: [c("change_pct", 30, "above", 0)], exit: [c("change_pct", 30, "below", 0)], rank_by_momentum: { period: 30, top_n: 3 }, position_size_pct: 33, max_positions: 3, stop_loss_pct: 12, take_profit_pct: null },
  },
  {
    creator: "dipdiva",
    joined: 75,
    hype: 23,
    prompt: "Buy Bitcoin or Ethereum when it drops more than 10% in a week. Sell when it's up 15% or if it falls another 10%.",
    strategy: { name: "Dip Hunter", summary: "Buys sharp weekly dips in the majors.", assets: ["BTC", "ETH"], entry: [c("change_pct", 7, "below", -10)], exit: [], rank_by_momentum: null, position_size_pct: 50, max_positions: 2, stop_loss_pct: 10, take_profit_pct: 15 },
  },
  {
    creator: "satoshi_fan",
    joined: 60,
    hype: 58,
    prompt: "Buy and hold Bitcoin and Ethereum forever. Never sell.",
    strategy: { name: "Diamond Hands", summary: "Buys Bitcoin and Ethereum and never sells.", assets: ["BTC", "ETH"], entry: [], exit: [], rank_by_momentum: null, position_size_pct: 50, max_positions: 2, stop_loss_pct: null, take_profit_pct: null },
  },
  {
    creator: "trendy_tom",
    joined: 45,
    hype: 12,
    prompt: "Buy any coin trading above its 50-day moving average and sell when it falls below it. Put 20% in each coin.",
    strategy: { name: "Trend Rider", summary: "Owns whatever is trending above its 50-day average.", assets: ALL, entry: [c("price_vs_sma", 50, "above", 0)], exit: [c("price_vs_sma", 50, "below", 0)], rank_by_momentum: null, position_size_pct: 20, max_positions: 5, stop_loss_pct: null, take_profit_pct: null },
  },
  {
    creator: "rsi_ronin",
    joined: 30,
    hype: 17,
    prompt: "Buy Solana, Ethereum or Avalanche when RSI drops below 30 and sell when RSI goes above 65.",
    strategy: { name: "RSI Sniper", summary: "Snipes oversold alts and sells into strength.", assets: ["SOL", "ETH", "AVAX"], entry: [c("rsi", 14, "below", 30)], exit: [c("rsi", 14, "above", 65)], rank_by_momentum: null, position_size_pct: 33, max_positions: 3, stop_loss_pct: null, take_profit_pct: null },
  },
  {
    creator: "moonboy",
    joined: 21,
    hype: 34,
    prompt: "Buy Dogecoin or Solana when they pump more than 8% in a day. Take profit at 20%, stop loss 7%.",
    strategy: { name: "Rocket Chaser", summary: "Jumps on big daily pumps with tight risk limits.", assets: ["DOGE", "SOL"], entry: [c("change_pct", 1, "above", 8)], exit: [], rank_by_momentum: null, position_size_pct: 50, max_positions: 2, stop_loss_pct: 7, take_profit_pct: 20 },
  },
  {
    creator: "ma_cross_max",
    joined: 14,
    hype: 6,
    prompt: "Buy Bitcoin when the 20-day average crosses above the 100-day average, sell when it crosses back below. Stop loss 8%.",
    strategy: { name: "Cross Fire", summary: "Classic moving-average crossover on Bitcoin.", assets: ["BTC"], entry: [c("sma_cross", 20, "above", 0, 100)], exit: [c("sma_cross", 20, "below", 0, 100)], rank_by_momentum: null, position_size_pct: 100, max_positions: 1, stop_loss_pct: 8, take_profit_pct: null },
  },
  {
    creator: "bottomfeeder",
    joined: 7,
    hype: 3,
    prompt: "Buy any coin that is 30% below its 90-day high, take profit at 25%.",
    strategy: { name: "Bottom Fisher", summary: "Buys coins that have crashed far from their highs.", assets: ALL, entry: [c("drawdown_from_high", 90, "above", 30)], exit: [], rank_by_momentum: null, position_size_pct: 20, max_positions: 5, stop_loss_pct: null, take_profit_pct: 25 },
  },
];

export function sampleBots() {
  return SAMPLES.map((s) => ({
    id: crypto.randomBytes(6).toString("base64url"),
    createdAt: new Date(Date.now() - s.joined * 86_400_000).toISOString(),
    joinedAt: daysAgo(s.joined),
    sample: true,
    name: s.strategy.name,
    creator: s.creator,
    prompt: s.prompt,
    strategy: sanitizeStrategy(s.strategy),
    hype: s.hype,
    clones: 0,
    clonedFrom: null,
  }));
}
