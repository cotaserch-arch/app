// Daily crypto prices. Uses Coinbase's free public market data when the server
// can reach it, and otherwise a clearly-labeled simulated market so the app
// always works (offline development, tests, or an API outage).
import { ASSETS } from "./strategy.js";

const HISTORY_DAYS = 400;
const DAY_MS = 86_400_000;
const REFRESH_MS = 30 * 60_000;

const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

// ---------- Simulated market ----------

// Hash-based randomness, so each day's move is fixed forever and the
// simulated history doesn't change when the server restarts.
function rand(seed) {
  let t = (seed + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function normal(seed) {
  const u = Math.max(rand(seed), 1e-9);
  const v = rand(seed ^ 0x9e3779b9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const SIM = {
  BTC: { price: 42000, beta: 1.0, vol: 1.2 },
  ETH: { price: 2300, beta: 1.15, vol: 1.8 },
  SOL: { price: 100, beta: 1.4, vol: 2.8 },
  XRP: { price: 0.6, beta: 1.1, vol: 2.6 },
  DOGE: { price: 0.09, beta: 1.5, vol: 3.4 },
  ADA: { price: 0.55, beta: 1.2, vol: 2.4 },
  AVAX: { price: 35, beta: 1.4, vol: 3.0 },
  LINK: { price: 15, beta: 1.25, vol: 2.6 },
  LTC: { price: 70, beta: 0.9, vol: 2.0 },
  DOT: { price: 7.5, beta: 1.2, vol: 2.4 },
};
const SIM_EPOCH = Date.UTC(2024, 0, 1);

export function simulatedMarket(now = Date.now()) {
  const totalDays = Math.floor((now - SIM_EPOCH) / DAY_MS) + 1;
  const first = Math.max(0, totalDays - HISTORY_DAYS);
  const dates = [];
  for (let d = first; d < totalDays; d++) dates.push(isoDay(SIM_EPOCH + d * DAY_MS));
  const series = {};
  ASSETS.forEach((asset, k) => {
    const { price, beta, vol } = SIM[asset];
    let p = price;
    const out = [];
    for (let d = 0; d < totalDays; d++) {
      // Slow-moving bull/bear regimes shared by the whole market.
      const regime = Math.sin(d / 47) * 0.25 + Math.sin(d / 131 + 1) * 0.2;
      const marketMove = regime + 2.2 * normal(d * 7919 + 17);
      const own = vol * normal(d * 104729 + k * 7907 + 3);
      const pct = Math.max(-40, beta * marketMove * 0.9 + own * 0.8);
      p *= 1 + pct / 100;
      if (d >= first) out.push(Number(p.toPrecision(6)));
    }
    series[asset] = out;
  });
  return { source: "simulated", dates, series, updatedAt: new Date(now).toISOString() };
}

// ---------- Live market (Coinbase Exchange public API) ----------

async function fetchCandles(asset, fetchImpl, now) {
  const closes = new Map();
  // Coinbase returns at most 300 candles per call, so ask in two windows.
  for (const [from, to] of [
    [now - 299 * DAY_MS, now],
    [now - (HISTORY_DAYS - 1) * DAY_MS, now - 300 * DAY_MS],
  ]) {
    const url =
      `https://api.exchange.coinbase.com/products/${asset}-USD/candles?granularity=86400` +
      `&start=${new Date(from).toISOString()}&end=${new Date(to).toISOString()}`;
    const res = await fetchImpl(url, {
      headers: { "user-agent": "Botfolio/0.1", accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`${asset}: HTTP ${res.status}`);
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error(`${asset}: unexpected response`);
    // Each row: [time (s), low, high, open, close, volume]
    for (const row of rows) {
      const [time, , , , close] = row;
      if (Number.isFinite(time) && Number.isFinite(close) && close > 0) closes.set(isoDay(time * 1000), close);
    }
  }
  return closes;
}

export async function fetchLiveMarket({ fetchImpl = fetch, now = Date.now() } = {}) {
  const perAsset = {};
  for (const asset of ASSETS) perAsset[asset] = await fetchCandles(asset, fetchImpl, now);
  const btcDays = perAsset.BTC.size;
  if (btcDays < 200) throw new Error(`Only ${btcDays} days of BTC history`);
  const dates = [...new Set(Object.values(perAsset).flatMap((m) => [...m.keys()]))].sort().slice(-HISTORY_DAYS);
  const series = {};
  for (const asset of ASSETS) series[asset] = dates.map((d) => perAsset[asset].get(d) ?? null);
  return { source: "live", dates, series, updatedAt: new Date(now).toISOString() };
}

// ---------- Provider ----------

export function createMarketProvider({ mode = process.env.MARKET_DATA || "auto", fetchImpl = fetch, log = console } = {}) {
  let market = withVersion(simulatedMarket());
  let timer = null;

  function withVersion(m) {
    return { ...m, version: `${m.source}:${m.dates.at(-1)}:${m.updatedAt}` };
  }

  async function refresh() {
    if (mode === "simulated") {
      market = withVersion(simulatedMarket());
      return market;
    }
    try {
      market = withVersion(await fetchLiveMarket({ fetchImpl }));
      log.log?.(`[market] Live prices loaded through ${market.dates.at(-1)}`);
    } catch (error) {
      if (market.source !== "live") market = withVersion(simulatedMarket());
      log.error?.(`[market] Live prices unavailable (${error.message}). Using ${market.source} data.`);
    }
    return market;
  }

  return {
    get: () => market,
    refresh,
    start() {
      const ready = refresh();
      timer = setInterval(refresh, REFRESH_MS);
      timer.unref?.();
      return ready;
    },
    stop: () => clearInterval(timer),
  };
}

export function ticker(market) {
  const last = market.dates.length - 1;
  return ASSETS.map((asset) => {
    const s = market.series[asset];
    const price = s[last];
    const prev = s[last - 1];
    return {
      asset,
      price,
      change24hPct: price != null && prev != null ? Math.round((price / prev - 1) * 10000) / 100 : null,
    };
  }).filter((t) => t.price != null);
}
