// Offline versions of the AI features: a rule-based English-to-strategy parser
// and a simple coach. Used in demo mode (no API key) and as a backup when an
// AI call fails.
import { ASSETS, sanitizeStrategy } from "./strategy.js";

const ASSET_WORDS = {
  BTC: ["bitcoin", "btc"],
  ETH: ["ethereum", "eth", "ether"],
  SOL: ["solana", "sol"],
  XRP: ["xrp", "ripple"],
  DOGE: ["dogecoin", "doge"],
  ADA: ["cardano", "ada"],
  AVAX: ["avalanche", "avax"],
  LINK: ["chainlink", "link"],
  LTC: ["litecoin", "ltc"],
  DOT: ["polkadot", "dot"],
};
const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const num = (s) => (s == null ? null : NUMBER_WORDS[s] ?? Number(s));
const PCT = "(\\d+(?:\\.\\d+)?)\\s*(?:%|percent)";

function findAssets(text) {
  if (/\b(all|any|every|each)\s+(coins?|crypto|cryptos|tokens?)\b|\b(top|best)\s+(\d+|one|two|three|four|five)?\s*(best\s+)?(perform|coins?|gainers?)/.test(text)) {
    return [...ASSETS];
  }
  const found = ASSETS.filter((a) => ASSET_WORDS[a].some((w) => new RegExp(`\\b${w}\\b`).test(text)));
  return found;
}

function findPeriod(clause, fallback) {
  if (/\b(in|over)\s+(a|one|1)\s+day\b|\b24\s*h|\bdaily\b|\btoday\b/.test(clause)) return 1;
  if (/\b(a|one|1)\s+week\b|\bweekly\b/.test(clause)) return 7;
  if (/\b(a|one|1)\s+month\b|\bmonthly\b/.test(clause)) return 30;
  const m = clause.match(/\b(?:in|over|last|past)\s+(?:the\s+)?(?:last\s+|past\s+)?(\d+|two|three|four|five|ten)\s*(days?|weeks?)\b/);
  if (m) return num(m[1]) * (m[2].startsWith("week") ? 7 : 1);
  return fallback;
}

function splitClauses(text) {
  return text
    .split(/(?<=[.;!?])\s+|,\s*(?=(?:and\s+)?(?:then\s+)?(?:sell|exit|buy)\b)|\s+(?=(?:and\s+)?(?:then\s+)?(?:sell|exit)\b)/)
    .map((c) => c.trim())
    .filter(Boolean);
}

export function parseStrategyOffline(rawText) {
  const text = rawText.toLowerCase().replace(/\s+/g, " ").trim();
  const notes = [];
  const entry = [];
  const exit = [];
  let rank = null;
  let stopLoss = null;
  let takeProfit = null;
  let archetype = null;
  const hodl = /\b(never sell|hold forever|forever|diamond hands|hodl|buy and hold)\b/.test(text);
  const set = (name) => (archetype ??= name);
  let m;

  let context = "entry";
  for (const clause of splitClauses(text)) {
    if (/\b(sell|exit|get out|close)\b/.test(clause)) context = "exit";
    else if (/\b(buy|enter|get in|hold|own|accumulate|purchase)\b/.test(clause)) context = "entry";

    if (context === "entry") {
      if ((m = clause.match(new RegExp(`\\b(?:drops?|falls?|dips?|down|crash(?:es)?|declines?|tanks?)\\s+(?:by\\s+)?(?:more than\\s+|over\\s+|at least\\s+)?${PCT}`)))) {
        entry.push({ indicator: "change_pct", period: findPeriod(clause, 1), period2: null, op: "below", value: -Number(m[1]) });
        set("dip");
      } else if ((m = clause.match(new RegExp(`\\b(?:rises?|up|gains?|pumps?|jumps?|climbs?|rallies)\\s+(?:by\\s+)?(?:more than\\s+|over\\s+)?${PCT}`)))) {
        entry.push({ indicator: "change_pct", period: findPeriod(clause, 1), period2: null, op: "above", value: Number(m[1]) });
        set("rally");
      }
      if (/golden cross/.test(clause)) {
        entry.push({ indicator: "sma_cross", period: 50, period2: 200, op: "above", value: 0 });
        set("cross");
      } else if ((m = clause.match(/(\d+)[-\s]?day (?:moving )?(?:average|ma|sma)? ?cross(?:es)? (?:above|over) (?:the )?(\d+)[-\s]?day/))) {
        entry.push({ indicator: "sma_cross", period: Number(m[1]), period2: Number(m[2]), op: "above", value: 0 });
        set("cross");
      } else if ((m = clause.match(/\b(above|over|below|under)\s+(?:its\s+|the\s+)?(\d+)[-\s]?day\s+(?:moving\s+)?(?:average|ma|sma)/))) {
        entry.push({ indicator: "price_vs_sma", period: Number(m[2]), period2: null, op: /above|over/.test(m[1]) ? "above" : "below", value: 0 });
        set("trend");
      }
      if ((m = clause.match(/\brsi\b[^\d]{0,25}?(below|under|above|over)\s*(\d+)/))) {
        entry.push({ indicator: "rsi", period: 14, period2: null, op: /below|under/.test(m[1]) ? "below" : "above", value: Number(m[2]) });
        set("rsi");
      } else if (/\boversold\b/.test(clause)) {
        entry.push({ indicator: "rsi", period: 14, period2: null, op: "below", value: 30 });
        set("rsi");
      }
      if ((m = clause.match(new RegExp(`${PCT}\\s+(?:below|off|from|under)\\s+(?:its\\s+|the\\s+)?(?:(\\d+)[-\\s]?day\\s+)?(?:high|ath|all[-\\s]time high|peak|top)`)))) {
        entry.push({ indicator: "drawdown_from_high", period: Number(m[2]) || 90, period2: null, op: "above", value: Number(m[1]) });
        set("bottom");
      }
      if ((m = clause.match(/\b(?:top|best)\s+(\d+|one|two|three|four|five)?\s*(?:best\s+)?(?:perform|coins?|gainers?)|\bmomentum\b/))) {
        rank = { period: findPeriod(clause, 30), top_n: num(m[1]) || 3 };
        set("momentum");
      }
    } else {
      if ((m = clause.match(new RegExp(`\\b(?:up|gains?|rises?|profit(?:\\s+of)?|is up|it's up|its up)\\s+(?:by\\s+)?(?:more than\\s+)?${PCT}|take[-\\s]profit\\s+(?:at\\s+|of\\s+)?${PCT}`)))) {
        takeProfit = Number(m[1] ?? m[2]);
      }
      if ((m = clause.match(new RegExp(`\\b(?:falls?|drops?|loses?|down|declines?)\\s+(?:another\\s+|a further\\s+)?(?:by\\s+)?(?:more than\\s+)?${PCT}|stop[-\\s]?loss\\s+(?:of\\s+|at\\s+)?${PCT}`)))) {
        stopLoss = Number(m[1] ?? m[2]);
      }
      if ((m = clause.match(/\b(?:below|under)\s+(?:its\s+|the\s+|that\s+)?(\d+)?[-\s]?(?:day\s+)?(?:moving\s+)?(?:average|ma|sma)/)) || /falls? below it\b/.test(clause)) {
        const trend = entry.find((c) => c.indicator === "price_vs_sma");
        exit.push({ indicator: "price_vs_sma", period: Number(m?.[1]) || trend?.period || 50, period2: null, op: "below", value: 0 });
      }
      if (/cross(?:es)?\s+(?:back\s+)?(?:below|under)|death cross/.test(clause)) {
        const cross = entry.find((c) => c.indicator === "sma_cross");
        exit.push({ indicator: "sma_cross", period: cross?.period ?? 50, period2: cross?.period2 ?? 200, op: "below", value: 0 });
      }
      if ((m = clause.match(/\brsi\b[^\d]{0,25}?(above|over)\s*(\d+)/))) {
        exit.push({ indicator: "rsi", period: 14, period2: null, op: "above", value: Number(m[2]) });
      } else if (/\boverbought\b/.test(clause)) {
        exit.push({ indicator: "rsi", period: 14, period2: null, op: "above", value: 70 });
      }
      if ((m = clause.match(/(\d+)[-\s]?day\s+(?:gain|return|change|performance)\s+(?:turns|goes|is)\s+negative/))) {
        exit.push({ indicator: "change_pct", period: Number(m[1]), period2: null, op: "below", value: 0 });
      }
    }
  }

  let assets = findAssets(text);
  if (!assets.length) {
    assets = ["BTC"];
    notes.push("No coin mentioned, so it trades Bitcoin.");
  }

  if (!entry.length && !rank && !hodl) {
    entry.push({ indicator: "price_vs_sma", period: 50, period2: null, op: "above", value: 0 });
    if (!exit.length && stopLoss == null && takeProfit == null) {
      exit.push({ indicator: "price_vs_sma", period: 50, period2: null, op: "below", value: 0 });
    }
    archetype = "trend";
    notes.push("Demo mode couldn't find a clear buy rule, so it started you with a trend-following rule. Edit your description or turn on AI for full understanding.");
  }
  if (hodl && !entry.length && !rank) archetype = "hodl";

  let maxPositions = rank ? rank.top_n : Math.min(assets.length, 4);
  const explicitMax = text.match(/\b(?:up to|max(?:imum)?(?: of)?|at most|no more than)\s+(\d+|two|three|four|five)\s+(?:coins|positions|trades)/);
  if (explicitMax) maxPositions = num(explicitMax[1]);
  let size = Math.floor(100 / maxPositions);
  if ((m = text.match(/\b(?:put|invest|allocate|use|risk|bet)\s+(\d+)\s*%|(\d+)\s*%\s+(?:per|in each|into each|on each|of (?:the|my) (?:account|portfolio|money))|never (?:put |invest )?more than (\d+)\s*%/))) {
    size = Number(m[1] ?? m[2] ?? m[3]);
    // "20% in each coin" across 10 coins means room for 5 at once.
    if (!explicitMax && !rank) maxPositions = Math.min(assets.length, Math.max(1, Math.floor(100 / size)));
  }

  const NAMES = {
    dip: "Dip Hunter",
    rally: "Rocket Chaser",
    trend: "Trend Rider",
    cross: "Cross Fire",
    rsi: "RSI Sniper",
    bottom: "Bottom Fisher",
    momentum: "Momentum Machine",
    hodl: "Diamond Hands",
  };
  const firstSentence = rawText.trim().split(/(?<=[.!?])\s+/)[0];
  const strategy = sanitizeStrategy({
    name: NAMES[archetype] || "Custom Bot",
    summary: firstSentence.length > 200 ? `${firstSentence.slice(0, 197)}…` : firstSentence,
    assets,
    entry,
    exit: hodl ? [] : exit,
    rank_by_momentum: rank,
    position_size_pct: size,
    max_positions: maxPositions,
    stop_loss_pct: hodl ? null : stopLoss,
    take_profit_pct: hodl ? null : takeProfit,
  });
  return { strategy, notes };
}

export function coachOffline(strategy, result) {
  const s = result.stats;
  const beat = s.returnPct - s.benchmarkReturnPct;
  const strengths = [];
  const weaknesses = [];

  if (beat > 0) strengths.push(`Beat simply holding Bitcoin by ${beat.toFixed(1)} points.`);
  else weaknesses.push(`Trailed simply holding Bitcoin by ${Math.abs(beat).toFixed(1)} points.`);
  if (s.maxDrawdownPct < 20) strengths.push(`Shallow worst drop (${s.maxDrawdownPct.toFixed(1)}%), which makes it easy to stick with.`);
  else if (s.maxDrawdownPct > 35) weaknesses.push(`At its worst it was down ${s.maxDrawdownPct.toFixed(1)}% from its peak. Most people would panic-sell there.`);
  if (s.winRatePct != null && s.winRatePct >= 55) strengths.push(`Wins ${s.winRatePct}% of its closed trades.`);
  if (s.winRatePct != null && s.winRatePct < 40) weaknesses.push(`Only ${s.winRatePct}% of closed trades were winners.`);
  if (s.sharpe != null && s.sharpe > 1) strengths.push(`Good return for the risk taken (Sharpe ${s.sharpe}).`);
  if (s.buys < 3) weaknesses.push(`It barely traded (${s.buys} buy${s.buys === 1 ? "" : "s"}), so the result could be luck.`);
  if (s.buys > 150) weaknesses.push(`${s.buys} buys in a year. Fees and slippage add up fast.`);

  let suggestion;
  if (s.maxDrawdownPct > 35 && strategy.stop_loss_pct == null) suggestion = "Add a stop loss around 10–15% to cap the big drops.";
  else if (s.buys < 3) suggestion = "Loosen the buy rule (smaller dip, shorter average) so it finds more trades.";
  else if (beat < 0 && strategy.assets.length < 3) suggestion = "Let it trade more coins so it has more chances to find winners.";
  else if (beat < 0) suggestion = "Try a longer moving average or fewer exit rules so it rides trends instead of getting shaken out.";
  else suggestion = "Enter it in the league to see if the edge holds up on prices it has never seen.";

  let grade = "F";
  if (beat > 0 && s.maxDrawdownPct < 25) grade = "A";
  else if (beat > 0) grade = "B";
  else if (s.returnPct > 0) grade = "C";
  else if (s.returnPct > -15) grade = "D";

  const verdicts = {
    A: "Strong: it beat Bitcoin without scary drops.",
    B: "Solid: it beat Bitcoin, but the ride was bumpy.",
    C: "Made money, but holding Bitcoin did better.",
    D: "Small loss. There's an idea here, but it needs work.",
    F: "Lost real ground. Rethink the rules before entering.",
  };
  return { grade, verdict: verdicts[grade], strengths: strengths.slice(0, 3), weaknesses: weaknesses.slice(0, 3), suggestion };
}
