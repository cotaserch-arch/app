import assert from "node:assert/strict";
import { test } from "node:test";
import { downsample, indicatorSeries, simulate } from "../src/engine.js";
import { simulatedMarket } from "../src/market.js";
import { sanitizeStrategy } from "../src/strategy.js";

// A tiny hand-made market: BTC goes 100 → 50 → 150, ETH stays flat.
function toyMarket(btc, eth = btc.map(() => 10)) {
  const dates = btc.map((_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
  return { dates, series: { BTC: btc, ETH: eth } };
}

const base = {
  name: "Test",
  summary: "",
  assets: ["BTC"],
  entry: [],
  exit: [],
  rank_by_momentum: null,
  position_size_pct: 100,
  max_positions: 1,
  stop_loss_pct: null,
  take_profit_pct: null,
};

test("buy and hold tracks the price minus one fee", () => {
  const market = toyMarket([100, 100, 120, 150]);
  const r = simulate(sanitizeStrategy(base), market, { feePct: 0.1 });
  assert.equal(r.trades.length, 1);
  // Bought at 100 on day 1 with 0.1% fee, now worth 150.
  assert.equal(r.stats.finalEquity, Math.round(10000 * 0.999 * 1.5 * 100) / 100);
  assert.equal(r.stats.benchmarkReturnPct, 50);
});

test("stop loss and take profit close positions", () => {
  const market = toyMarket([100, 100, 89, 100, 100, 125]);
  const strategy = sanitizeStrategy({ ...base, stop_loss_pct: 10, take_profit_pct: 20 });
  const r = simulate(strategy, market, { feePct: 0 });
  const sells = r.trades.filter((t) => t.side === "sell");
  assert.equal(sells[0].reason, "stop loss");
  assert.equal(sells[0].pnlPct, -11);
  assert.equal(sells[1].reason, "take profit");
  assert.equal(r.stats.closedTrades, 2);
  assert.equal(r.stats.winRatePct, 50);
});

test("entry conditions gate buys", () => {
  const market = toyMarket([100, 100, 100, 85, 90]);
  const strategy = sanitizeStrategy({
    ...base,
    entry: [{ indicator: "change_pct", period: 1, period2: null, op: "below", value: -10 }],
  });
  const r = simulate(strategy, market, { feePct: 0 });
  assert.deepEqual(r.trades.map((t) => [t.date, t.side]), [["2026-01-04", "buy"]]);
  assert.equal(r.stats.returnPct, Math.round((90 / 85 - 1) * 10000) / 100);
});

test("momentum ranking only buys the leaders", () => {
  const market = toyMarket([100, 110, 120, 130], [100, 90, 80, 70]);
  const strategy = sanitizeStrategy({ ...base, assets: ["BTC", "ETH"], rank_by_momentum: { period: 1, top_n: 1 }, position_size_pct: 50, max_positions: 2 });
  const r = simulate(strategy, market, { feePct: 0 });
  assert.ok(r.trades.every((t) => t.asset === "BTC"));
});

test("indicators", () => {
  const closes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.equal(indicatorSeries(closes, { indicator: "change_pct", period: 1, period2: null }).at(-1), (10 / 9 - 1) * 100);
  const sma = indicatorSeries(closes, { indicator: "price_vs_sma", period: 4, period2: null });
  assert.equal(sma[2], null);
  assert.equal(sma.at(-1), (10 / 8.5 - 1) * 100);
  const rsi = indicatorSeries(closes, { indicator: "rsi", period: 3, period2: null });
  assert.equal(rsi.at(-1), 100);
  const dd = indicatorSeries([10, 8, 9], { indicator: "drawdown_from_high", period: 3, period2: null });
  assert.ok(Math.abs(dd.at(-1) - 10) < 1e-9);
});

test("the simulated market is stable and complete", () => {
  const a = simulatedMarket(Date.UTC(2026, 5, 1));
  const b = simulatedMarket(Date.UTC(2026, 5, 2));
  assert.equal(a.dates.length, 400);
  assert.equal(a.source, "simulated");
  // Yesterday's prices don't change when a new day is added.
  const i = b.dates.indexOf(a.dates.at(-1));
  assert.equal(b.series.BTC[i], a.series.BTC.at(-1));
  for (const s of Object.values(a.series)) assert.ok(s.every((p) => p > 0));
});

test("sanitizeStrategy clamps unsafe values", () => {
  const s = sanitizeStrategy({
    ...base,
    name: "  ",
    assets: ["BTC", "BTC"],
    position_size_pct: 500,
    max_positions: 99,
    stop_loss_pct: 0,
    entry: [{ indicator: "rsi", period: 0, period2: null, op: "below", value: 150 }],
  });
  assert.equal(s.name, "Unnamed Bot");
  assert.deepEqual(s.assets, ["BTC"]);
  assert.equal(s.position_size_pct, 100);
  assert.equal(s.max_positions, 10);
  assert.equal(s.stop_loss_pct, 0.5);
  assert.equal(s.entry[0].period, 2);
  assert.equal(s.entry[0].value, 100);
  assert.throws(() => sanitizeStrategy({ ...base, assets: ["SCAMCOIN"] }));
});

test("downsample keeps the ends", () => {
  const pts = Array.from({ length: 100 }, (_, i) => i);
  const d = downsample(pts, 10);
  assert.equal(d.length, 10);
  assert.equal(d[0], 0);
  assert.equal(d.at(-1), 99);
});
