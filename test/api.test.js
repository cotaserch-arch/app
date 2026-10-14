import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createApp } from "../src/app.js";
import { simulatedMarket } from "../src/market.js";
import { coachOffline, parseStrategyOffline } from "../src/offline.js";
import { sampleBots } from "../src/seed.js";
import { createStore } from "../src/store.js";

// Deterministic stand-ins for the network and the Claude calls.
const m = { ...simulatedMarket(), version: "test" };
const market = { get: () => m };
const fakeAi = {
  aiMode: () => "demo",
  compileStrategy: async (text) => ({ ...parseStrategyOffline(text), source: "demo" }),
  coachStrategy: async (strategy, result) => ({ ...coachOffline(strategy, result), source: "demo" }),
};

let server;
let base;

before(async () => {
  const store = createStore(null, { seed: sampleBots });
  const app = createApp({ store, market, ai: fakeAi, limits: { ai: 1000, write: 1000 }, env: { ADMIN_TOKEN: "secret", ADSENSE_CLIENT: "ca-pub-123" } });
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

async function call(path, { method = "GET", body, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, data: await res.json() };
}

test("build, backtest, coach, enter, rank, hype, clone", async () => {
  const text = "Buy Solana or Ethereum when RSI drops below 30 and sell when RSI goes above 65.";
  const compiled = await call("/api/strategies/compile", { method: "POST", body: { text } });
  assert.equal(compiled.status, 200);
  const { strategy } = compiled.data;
  assert.deepEqual(strategy.assets, ["ETH", "SOL"]);

  const bt = await call("/api/strategies/backtest", { method: "POST", body: { strategy } });
  assert.equal(bt.status, 200);
  assert.equal(bt.data.result.stats.days, 366);
  assert.ok(bt.data.rules.length >= 3);
  assert.equal(bt.data.result.curve.length, 366);

  const coach = await call("/api/strategies/coach", { method: "POST", body: { strategy } });
  assert.match(coach.data.coach.grade, /^[ABCDF]$/);

  const created = await call("/api/bots", { method: "POST", body: { name: "Oversold Ollie", creator: "tester_1", prompt: text, strategy } });
  assert.equal(created.status, 201);
  const { id } = created.data;

  const bot = await call(`/api/bots/${id}`);
  assert.equal(bot.status, 200);
  assert.equal(bot.data.bot.name, "Oversold Ollie");
  assert.equal(bot.data.bot.strategy.name, "Oversold Ollie");
  assert.equal(bot.data.bot.joinedAt, m.dates.at(-1));
  assert.equal(bot.data.live.stats.days, 1);
  assert.ok(bot.data.bot.badges.some((b) => b.name === "Rookie"));

  const board = await call("/api/leaderboard");
  assert.equal(board.data.total, 9);
  const ranks = board.data.bots.map((b) => b.rank);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
  const returns = board.data.bots.map((b) => b.returnPct);
  assert.deepEqual(returns, [...returns].sort((a, b) => b - a));
  assert.ok(board.data.highlights.leader.daysLive >= 7);

  const h1 = await call(`/api/bots/${id}/hype`, { method: "POST", body: {} });
  assert.equal(h1.data.hype, 1);
  const h2 = await call(`/api/bots/${id}/hype`, { method: "POST", body: {} });
  assert.equal(h2.data.hype, 1, "one hype per visitor per day");
  assert.equal(h2.data.already, true);

  const clone = await call("/api/bots", {
    method: "POST",
    body: { name: "Ollie 2.0", creator: "tester_2", strategy: bot.data.bot.strategy, clonedFrom: id },
  });
  assert.equal(clone.status, 201);
  assert.equal((await call(`/api/bots/${id}`)).data.bot.clones, 1);

  const trending = await call("/api/leaderboard?sort=trending");
  const hypes = trending.data.bots.map((b) => b.hype);
  assert.deepEqual(hypes, [...hypes].sort((a, b) => b - a));
});

test("battles compare two bots on the same window", async () => {
  const { data } = await call("/api/leaderboard");
  const [a, b] = data.bots;
  const battle = await call(`/api/battle?a=${a.id}&b=${b.id}&days=30`);
  assert.equal(battle.status, 200);
  assert.equal(battle.data.days, 30);
  assert.equal(battle.data.fighters.length, 2);
  assert.equal(battle.data.fighters[0].stats.days, battle.data.fighters[1].stats.days);
  assert.ok([a.id, b.id, null].includes(battle.data.winner));
  assert.ok(battle.data.benchmark.length > 0);

  const self = await call(`/api/battle?a=${a.id}&b=${a.id}`);
  assert.equal(self.status, 400);
});

test("rejects bad input", async () => {
  assert.equal((await call("/api/strategies/compile", { method: "POST", body: { text: "hi" } })).status, 400);
  const badStrategy = await call("/api/strategies/backtest", { method: "POST", body: { strategy: { name: "x" } } });
  assert.equal(badStrategy.status, 400);
  const { strategy } = parseStrategyOffline("Buy and hold Bitcoin forever.");
  const badName = await call("/api/bots", { method: "POST", body: { name: "Ok", creator: "<script>", strategy } });
  assert.equal(badName.status, 400);
  assert.match(badName.data.error, /Trader names/);
  assert.equal((await call("/api/bots/nope")).status, 404);
  assert.equal((await call("/api/waitlist", { method: "POST", body: { email: "nope" } })).status, 400);
});

test("waitlist and admin stats", async () => {
  assert.equal((await call("/api/waitlist", { method: "POST", body: { email: "Fan@Example.com", plan: "whale" } })).status, 201);
  assert.equal((await call("/api/waitlist", { method: "POST", body: { email: "fan@example.com", plan: "pro" } })).status, 201);
  assert.equal((await call("/api/admin/stats")).status, 403);
  const stats = await call("/api/admin/stats", { headers: { "x-admin-token": "secret" } });
  assert.equal(stats.status, 200);
  assert.equal(stats.data.waitlist.length, 1, "same email is stored once");
  assert.equal(stats.data.waitlist[0].plan, "pro");
});

test("config, market and pages", async () => {
  const config = await call("/api/config");
  assert.equal(config.data.market.source, "simulated");
  assert.equal(config.data.templates.length, 6);
  const mk = await call("/api/market");
  assert.equal(mk.data.ticker.length, 10);
  const adsTxt = await fetch(`${base}/ads.txt`).then((r) => r.text());
  assert.equal(adsTxt, "google.com, pub-123, DIRECT, f08c47fec0942fa0\n");
  assert.equal(config.data.ads.adsenseClient, "ca-pub-123");
  for (const path of ["/", "/league", "/battle", "/pro", "/bot/anything", "/manifest.webmanifest", "/sw.js", "/icons/icon-192.png"]) {
    const res = await fetch(base + path);
    assert.equal(res.status, 200, path);
  }
});
