import assert from "node:assert/strict";
import { test } from "node:test";
import { simulate } from "../src/engine.js";
import { simulatedMarket } from "../src/market.js";
import { coachOffline, parseStrategyOffline } from "../src/offline.js";
import { TEMPLATES } from "../src/strategy.js";

const find = (list, indicator) => list.find((c) => c.indicator === indicator);

test("buy-the-dip with stop loss and take profit", () => {
  const { strategy } = parseStrategyOffline(
    "Buy Bitcoin or Ethereum when it drops more than 10% in a week. Sell when it's up 15% or if it falls another 10%.",
  );
  assert.deepEqual(strategy.assets, ["BTC", "ETH"]);
  assert.deepEqual(find(strategy.entry, "change_pct"), { indicator: "change_pct", period: 7, period2: null, op: "below", value: -10 });
  assert.equal(strategy.take_profit_pct, 15);
  assert.equal(strategy.stop_loss_pct, 10);
  assert.equal(strategy.name, "Dip Hunter");
});

test("trend following across all coins", () => {
  const { strategy } = parseStrategyOffline(
    "Buy any coin trading above its 50-day moving average and sell when it falls below it. Put 20% in each coin.",
  );
  assert.equal(strategy.assets.length, 10);
  assert.equal(find(strategy.entry, "price_vs_sma").op, "above");
  assert.equal(find(strategy.exit, "price_vs_sma").op, "below");
  assert.equal(strategy.position_size_pct, 20);
  assert.equal(strategy.max_positions, 5);
});

test("RSI and crossovers", () => {
  const rsi = parseStrategyOffline("Buy Solana when RSI drops below 30 and sell when RSI goes above 65.").strategy;
  assert.equal(find(rsi.entry, "rsi").value, 30);
  assert.equal(find(rsi.exit, "rsi").value, 65);

  const cross = parseStrategyOffline(
    "Buy Bitcoin when the 20-day average crosses above the 100-day average, sell when it crosses back below. Stop loss 8%.",
  ).strategy;
  assert.deepEqual(find(cross.entry, "sma_cross"), { indicator: "sma_cross", period: 20, period2: 100, op: "above", value: 0 });
  assert.equal(find(cross.exit, "sma_cross").op, "below");
  assert.equal(cross.stop_loss_pct, 8);
});

test("diamond hands never sells", () => {
  const { strategy } = parseStrategyOffline("Buy and hold Bitcoin and Ethereum forever. Never sell.");
  assert.deepEqual(strategy.entry, []);
  assert.deepEqual(strategy.exit, []);
  assert.equal(strategy.stop_loss_pct, null);
  assert.equal(strategy.name, "Diamond Hands");
});

test("momentum top N", () => {
  const { strategy } = parseStrategyOffline("Every day buy the 3 best performing coins over the last 30 days.");
  assert.deepEqual(strategy.rank_by_momentum, { period: 30, top_n: 3 });
  assert.equal(strategy.assets.length, 10);
});

test("gibberish gets a safe default and an explanation", () => {
  const { strategy, notes } = parseStrategyOffline("make me rich pls");
  assert.ok(strategy.entry.length > 0);
  assert.ok(notes.some((n) => n.includes("couldn't find a clear buy rule")));
});

test("every template parses to a bot that trades", () => {
  const market = simulatedMarket(Date.UTC(2026, 5, 1));
  for (const t of TEMPLATES) {
    const { strategy, notes } = parseStrategyOffline(t.text);
    assert.deepEqual(notes, [], t.label);
    const r = simulate(strategy, market, { startDate: market.dates[34] });
    assert.ok(r.stats.buys > 0, `${t.label} never traded`);
    const coach = coachOffline(strategy, r);
    assert.match(coach.grade, /^[ABCDF]$/);
    assert.ok(coach.suggestion.length > 10);
  }
});
