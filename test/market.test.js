import assert from "node:assert/strict";
import { test } from "node:test";
import { createMarketProvider, fetchLiveMarket, ticker } from "../src/market.js";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 14, 12);

// Answers like Coinbase's candles endpoint: newest first, [time, low, high, open, close, volume].
function fakeCoinbase({ missing = [] } = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const u = new URL(url);
    const asset = u.pathname.split("/")[2].replace("-USD", "");
    if (missing.includes(asset)) return { ok: false, status: 404, json: async () => ({}) };
    const start = Date.parse(u.searchParams.get("start"));
    const end = Date.parse(u.searchParams.get("end"));
    const rows = [];
    for (let t = Math.floor(end / DAY) * DAY; t >= start - DAY / 2; t -= DAY) {
      const close = 1000 + Math.round((t - NOW) / DAY); // rises $1 a day
      rows.push([t / 1000, close - 1, close + 1, close, close, 1000]);
    }
    return { ok: true, status: 200, json: async () => rows };
  };
  return { fetchImpl, calls };
}

test("parses Coinbase candles into aligned daily closes", async () => {
  const { fetchImpl, calls } = fakeCoinbase();
  const m = await fetchLiveMarket({ fetchImpl, now: NOW });
  assert.equal(m.source, "live");
  assert.equal(calls.length, 20, "two windows for each of 10 coins");
  assert.equal(m.dates.at(-1), "2026-10-14");
  assert.equal(m.dates.length, 400);
  assert.deepEqual([...m.dates].sort(), m.dates);
  assert.equal(m.series.BTC.at(-1), 1000);
  assert.equal(m.series.BTC.at(-2), 999);
  const t = ticker(m);
  assert.equal(t[0].asset, "BTC");
  assert.equal(t[0].change24hPct, Math.round((1000 / 999 - 1) * 10000) / 100);
});

test("falls back to the simulated market when prices can't be fetched", async () => {
  const quiet = { log() {}, error() {} };
  const failing = createMarketProvider({ mode: "auto", fetchImpl: async () => { throw new Error("offline"); }, log: quiet });
  const m = await failing.refresh();
  assert.equal(m.source, "simulated");

  const { fetchImpl } = fakeCoinbase({ missing: ["BTC"] });
  const noBtc = createMarketProvider({ mode: "auto", fetchImpl, log: quiet });
  assert.equal((await noBtc.refresh()).source, "simulated");
});
