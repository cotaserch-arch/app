// The paper-trading engine. Given a strategy and daily prices it replays every
// day: sells first, then buys, at that day's closing price, charging a fee per
// trade. Deterministic, so the same bot on the same prices always scores the same.

export const STARTING_CASH = 10_000;
export const FEE_PCT = 0.1;

const indicatorCache = new WeakMap();

function rollingMean(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null) {
      sum = 0;
      count = 0;
      continue;
    }
    sum += v;
    count++;
    if (count > period) {
      sum -= values[i - period];
      count = period;
    }
    if (count === period) out[i] = sum / period;
  }
  return out;
}

function compute(closes, { indicator, period, period2 }) {
  const n = closes.length;
  const out = new Array(n).fill(null);
  const ok = (i) => i >= 0 && closes[i] != null;
  switch (indicator) {
    case "change_pct":
      for (let i = period; i < n; i++) if (ok(i) && ok(i - period)) out[i] = (closes[i] / closes[i - period] - 1) * 100;
      return out;
    case "price_vs_sma": {
      const sma = rollingMean(closes, period);
      for (let i = 0; i < n; i++) if (sma[i] != null) out[i] = (closes[i] / sma[i] - 1) * 100;
      return out;
    }
    case "sma_cross": {
      const fast = rollingMean(closes, period);
      const slow = rollingMean(closes, period2);
      for (let i = 0; i < n; i++) if (fast[i] != null && slow[i] != null) out[i] = (fast[i] / slow[i] - 1) * 100;
      return out;
    }
    case "rsi": {
      for (let i = period; i < n; i++) {
        let gain = 0;
        let loss = 0;
        let valid = true;
        for (let j = i - period + 1; j <= i; j++) {
          if (!ok(j) || !ok(j - 1)) {
            valid = false;
            break;
          }
          const d = closes[j] - closes[j - 1];
          if (d > 0) gain += d;
          else loss -= d;
        }
        if (!valid) continue;
        out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
      }
      return out;
    }
    case "drawdown_from_high":
      for (let i = 0; i < n; i++) {
        if (!ok(i)) continue;
        let high = -Infinity;
        for (let j = Math.max(0, i - period + 1); j <= i; j++) if (ok(j)) high = Math.max(high, closes[j]);
        out[i] = (1 - closes[i] / high) * 100;
      }
      return out;
    case "volatility":
      for (let i = period; i < n; i++) {
        const rets = [];
        for (let j = i - period + 1; j <= i; j++) if (ok(j) && ok(j - 1)) rets.push((closes[j] / closes[j - 1] - 1) * 100);
        if (rets.length < period) continue;
        const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
        out[i] = Math.sqrt(rets.reduce((a, r) => a + (r - mean) ** 2, 0) / rets.length);
      }
      return out;
    default:
      return out;
  }
}

// Indicator values for one coin, cached per price array.
export function indicatorSeries(closes, cond) {
  let byKey = indicatorCache.get(closes);
  if (!byKey) indicatorCache.set(closes, (byKey = new Map()));
  const key = `${cond.indicator}:${cond.period}:${cond.period2}`;
  if (!byKey.has(key)) byKey.set(key, compute(closes, cond));
  return byKey.get(key);
}

function holds(closes, cond, i) {
  const v = indicatorSeries(closes, cond)[i];
  if (v == null) return false;
  return cond.op === "above" ? v > cond.value : v < cond.value;
}

function indexOnOrAfter(dates, date) {
  if (!date) return 0;
  const i = dates.findIndex((d) => d >= date);
  return i === -1 ? dates.length - 1 : i;
}

function maxDrawdown(values) {
  let peak = -Infinity;
  let worst = 0;
  for (const v of values) {
    peak = Math.max(peak, v);
    worst = Math.max(worst, (1 - v / peak) * 100);
  }
  return worst;
}

function sharpe(values) {
  if (values.length < 15) return null;
  const rets = [];
  for (let i = 1; i < values.length; i++) rets.push(values[i] / values[i - 1] - 1);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, r) => a + (r - mean) ** 2, 0) / rets.length);
  return sd === 0 ? null : (mean / sd) * Math.sqrt(365);
}

const round = (n, d = 2) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);

export function simulate(strategy, market, { startDate, endDate, cash = STARTING_CASH, feePct = FEE_PCT } = {}) {
  const { dates, series } = market;
  const start = Math.max(1, indexOnOrAfter(dates, startDate));
  const end = endDate ? Math.min(dates.length - 1, indexOnOrAfter(dates, endDate)) : dates.length - 1;
  const fee = feePct / 100;
  const assets = strategy.assets.filter((a) => series[a]);
  const positions = new Map(); // asset -> { qty, entryPrice, entryDate }
  const trades = [];
  const curve = [];
  const benchmark = [];
  let wins = 0;
  let closed = 0;

  const btc = series.BTC;
  const btcStartIdx = (() => {
    for (let i = start; i <= end; i++) if (btc?.[i] != null) return i;
    return -1;
  })();

  for (let i = start; i <= end; i++) {
    const price = (a) => series[a][i];
    const equity = () => {
      let total = cash;
      for (const [a, p] of positions) total += p.qty * (price(a) ?? p.lastPrice);
      return total;
    };

    // 1. Sells
    for (const [asset, pos] of [...positions]) {
      const px = price(asset);
      if (px == null) continue;
      pos.lastPrice = px;
      const pnl = (px / pos.entryPrice - 1) * 100;
      let reason = null;
      if (strategy.stop_loss_pct != null && pnl <= -strategy.stop_loss_pct) reason = "stop loss";
      else if (strategy.take_profit_pct != null && pnl >= strategy.take_profit_pct) reason = "take profit";
      else if (strategy.exit.some((c) => holds(series[asset], c, i))) reason = "exit rule";
      if (!reason) continue;
      const proceeds = pos.qty * px * (1 - fee);
      cash += proceeds;
      positions.delete(asset);
      closed++;
      if (pnl > 0) wins++;
      trades.push({ date: dates[i], side: "sell", asset, price: px, amount: round(proceeds), pnlPct: round(pnl), reason });
    }

    // 2. Buys
    if (positions.size < strategy.max_positions) {
      let candidates = assets.filter(
        (a) => !positions.has(a) && price(a) != null && strategy.entry.every((c) => holds(series[a], c, i)),
      );
      if (strategy.rank_by_momentum) {
        const { period, top_n } = strategy.rank_by_momentum;
        const momentum = (a) => indicatorSeries(series[a], { indicator: "change_pct", period, period2: null })[i];
        const top = assets
          .filter((a) => momentum(a) != null)
          .sort((a, b) => momentum(b) - momentum(a))
          .slice(0, top_n);
        candidates = top.filter((a) => candidates.includes(a));
      }
      for (const asset of candidates) {
        if (positions.size >= strategy.max_positions) break;
        const amount = Math.min(cash, equity() * (strategy.position_size_pct / 100));
        if (amount < 1) break;
        const px = price(asset);
        cash -= amount;
        positions.set(asset, { qty: (amount * (1 - fee)) / px, entryPrice: px, entryDate: dates[i], lastPrice: px });
        trades.push({ date: dates[i], side: "buy", asset, price: px, amount: round(amount) });
      }
    }

    curve.push({ date: dates[i], equity: round(equity()) });
    if (btcStartIdx !== -1 && i >= btcStartIdx && btc[i] != null) {
      benchmark.push({ date: dates[i], equity: round(STARTING_CASH * (btc[i] / btc[btcStartIdx])) });
    }
  }

  const values = curve.map((p) => p.equity);
  const final = values.at(-1) ?? cash;
  const lastBench = benchmark.at(-1)?.equity ?? STARTING_CASH;
  return {
    startDate: dates[start],
    endDate: dates[end],
    curve,
    benchmark,
    trades,
    openPositions: [...positions].map(([asset, p]) => ({
      asset,
      entryDate: p.entryDate,
      entryPrice: p.entryPrice,
      pnlPct: round((p.lastPrice / p.entryPrice - 1) * 100),
    })),
    stats: {
      startingCash: STARTING_CASH,
      finalEquity: round(final),
      returnPct: round((final / STARTING_CASH - 1) * 100),
      benchmarkReturnPct: round((lastBench / STARTING_CASH - 1) * 100),
      maxDrawdownPct: round(maxDrawdown(values)),
      sharpe: round(sharpe(values)),
      buys: trades.filter((t) => t.side === "buy").length,
      closedTrades: closed,
      winRatePct: closed ? round((wins / closed) * 100, 1) : null,
      days: curve.length,
    },
  };
}

// Evenly thins a series to at most n points (keeps first and last).
export function downsample(points, n) {
  if (points.length <= n) return points;
  const out = [];
  for (let k = 0; k < n; k++) out.push(points[Math.round((k * (points.length - 1)) / (n - 1))]);
  return out;
}
