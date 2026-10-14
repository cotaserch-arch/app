import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { z } from "zod";
import { describeStrategy } from "../public/js/describe.js";
import * as defaultAi from "./ai.js";
import { badgesFor } from "./badges.js";
import { downsample, simulate } from "./engine.js";
import { ticker } from "./market.js";
import { ASSETS, ASSET_NAMES, StrategySchema, TEMPLATES, sanitizeStrategy } from "./strategy.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, "..", "public");

const TextInput = z.object({ text: z.string().trim().min(8, "Describe your strategy in a sentence or two.").max(1500) });
const StrategyInput = z.object({ strategy: StrategySchema, days: z.coerce.number().int().min(30).max(365).default(365) });
const BotInput = z.object({
  name: z.string().trim().min(2, "Give your bot a name.").max(40),
  creator: z.string().trim().min(2, "Pick a trader name.").max(24).regex(/^[\w.-]+$/, "Trader names can use letters, numbers, dots, dashes and underscores."),
  prompt: z.string().trim().max(1500).default(""),
  strategy: StrategySchema,
  clonedFrom: z.string().max(20).nullable().optional(),
});
const WaitlistInput = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email.").max(120),
  plan: z.enum(["pro", "whale", "sponsor"]).default("pro"),
});

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function parse(schema, body) {
  const result = schema.safeParse(body ?? {});
  if (!result.success) throw new HttpError(400, result.error.issues[0]?.message || "Invalid input.");
  return result.data;
}

function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const recent = (hits.get(req.ip) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) return res.status(429).json({ error: "Slow down a little. Try again in a few minutes." });
    recent.push(now);
    hits.set(req.ip, recent);
    if (hits.size > 10_000) hits.clear();
    next();
  };
}

const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export function createApp({ store, market, ai = defaultAi, limits = {}, env = process.env }) {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));

  const aiLimit = rateLimit({ windowMs: 10 * 60_000, max: limits.ai ?? 30 });
  const writeLimit = rateLimit({ windowMs: 10 * 60_000, max: limits.write ?? 30 });
  const hypeSeen = new Set();

  // Live results are cached until the price data changes.
  let cacheVersion = null;
  const cache = new Map();
  function liveResult(bot) {
    const m = market.get();
    if (cacheVersion !== m.version) {
      cache.clear();
      cacheVersion = m.version;
    }
    if (!cache.has(bot.id)) cache.set(bot.id, simulate(bot.strategy, m, { startDate: bot.joinedAt }));
    return cache.get(bot.id);
  }

  const lastYear = (m) => m.dates[Math.max(0, m.dates.length - 366)];
  const sinceDays = (m, days) => m.dates[Math.max(0, m.dates.length - 1 - days)];

  function summary(bot) {
    const live = liveResult(bot);
    const curve = live.curve;
    const prev = curve.at(-2)?.equity ?? live.stats.startingCash;
    return {
      id: bot.id,
      name: bot.name,
      creator: bot.creator,
      sample: bot.sample,
      joinedAt: bot.joinedAt,
      createdAt: bot.createdAt,
      daysLive: Math.max(0, daysBetween(bot.joinedAt, market.get().dates.at(-1))),
      returnPct: live.stats.returnPct,
      benchmarkReturnPct: live.stats.benchmarkReturnPct,
      maxDrawdownPct: live.stats.maxDrawdownPct,
      dayChangePct: Math.round((curve.at(-1).equity / prev - 1) * 10000) / 100,
      spark: downsample(curve, 40).map((p) => p.equity),
      holdings: live.openPositions.map((p) => p.asset),
      hype: bot.hype,
      clones: bot.clones,
      badges: badgesFor(bot, live),
    };
  }

  function rankedBots() {
    return store
      .bots()
      .map(summary)
      .sort((a, b) => b.returnPct - a.returnPct || a.joinedAt.localeCompare(b.joinedAt))
      .map((b, i) => ({ ...b, rank: i + 1 }));
  }

  function loadBot(id) {
    const bot = store.getBot(id);
    if (!bot) throw new HttpError(404, "Bot not found.");
    return bot;
  }

  app.get("/api/config", (req, res) => {
    const m = market.get();
    res.json({
      aiMode: ai.aiMode(),
      market: { source: m.source, updatedAt: m.updatedAt, lastDate: m.dates.at(-1) },
      assets: ASSETS,
      assetNames: ASSET_NAMES,
      templates: TEMPLATES,
      ads: {
        adsenseClient: env.ADSENSE_CLIENT || null,
        adsenseSlot: env.ADSENSE_SLOT || null,
        sponsor: env.SPONSOR_NAME
          ? { name: env.SPONSOR_NAME, text: env.SPONSOR_TEXT || "", url: env.SPONSOR_URL || "#" }
          : null,
      },
    });
  });

  app.get("/api/market", (req, res) => {
    const m = market.get();
    res.json({ source: m.source, updatedAt: m.updatedAt, ticker: ticker(m) });
  });

  app.post("/api/strategies/compile", aiLimit, async (req, res) => {
    const { text } = parse(TextInput, req.body);
    res.json(await ai.compileStrategy(text));
  });

  app.post("/api/strategies/backtest", (req, res) => {
    const input = parse(StrategyInput, req.body);
    const strategy = sanitizeStrategy(input.strategy);
    const m = market.get();
    const result = simulate(strategy, m, { startDate: sinceDays(m, input.days) });
    res.json({
      strategy,
      rules: describeStrategy(strategy, ASSETS.length),
      market: { source: m.source },
      result: { ...result, trades: result.trades.slice(-40) },
    });
  });

  app.post("/api/strategies/coach", aiLimit, async (req, res) => {
    const { strategy: raw } = parse(StrategyInput, req.body);
    const strategy = sanitizeStrategy(raw);
    const m = market.get();
    const result = simulate(strategy, m, { startDate: lastYear(m) });
    res.json({ coach: await ai.coachStrategy(strategy, result) });
  });

  app.post("/api/bots", writeLimit, (req, res) => {
    const input = parse(BotInput, req.body);
    const strategy = sanitizeStrategy({ ...input.strategy, name: input.name });
    const parent = input.clonedFrom ? store.getBot(input.clonedFrom) : null;
    const bot = store.createBot({
      name: input.name,
      creator: input.creator,
      prompt: input.prompt,
      strategy,
      joinedAt: market.get().dates.at(-1),
      clonedFrom: parent?.id ?? null,
    });
    if (parent) store.updateBot(parent.id, (b) => ({ clones: (b.clones || 0) + 1 }));
    res.status(201).json({ id: bot.id });
  });

  app.get("/api/leaderboard", (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 200);
    let bots = rankedBots();
    if (req.query.sort === "trending") bots.sort((a, b) => b.hype - a.hype || a.rank - b.rank);
    if (req.query.sort === "new") bots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const all = rankedBots();
    const veterans = all.filter((b) => b.daysLive >= 7);
    const highlights = all.length
      ? {
          leader: veterans[0] ?? all[0],
          mover: [...all].sort((a, b) => b.dayChangePct - a.dayChangePct)[0],
          favorite: [...all].sort((a, b) => b.hype - a.hype)[0],
        }
      : null;
    const m = market.get();
    res.json({ bots: bots.slice(0, limit), total: all.length, highlights, market: { source: m.source, lastDate: m.dates.at(-1) } });
  });

  app.get("/api/bots/:id", (req, res) => {
    const bot = loadBot(req.params.id);
    const m = market.get();
    const live = liveResult(bot);
    const backtest = simulate(bot.strategy, m, { startDate: lastYear(m) });
    const ranked = rankedBots();
    const rank = ranked.find((b) => b.id === bot.id)?.rank;
    res.json({
      bot: { ...summary(bot), prompt: bot.prompt, strategy: bot.strategy, clonedFrom: bot.clonedFrom ?? null, rank },
      rules: describeStrategy(bot.strategy, ASSETS.length),
      live: { ...live, trades: live.trades.slice(-30).reverse() },
      backtest: { stats: backtest.stats, curve: downsample(backtest.curve, 120), benchmark: downsample(backtest.benchmark, 120) },
      market: { source: m.source },
      total: ranked.length,
    });
  });

  app.post("/api/bots/:id/hype", writeLimit, (req, res) => {
    const bot = loadBot(req.params.id);
    const key = `${req.ip}:${bot.id}:${new Date().toISOString().slice(0, 10)}`;
    if (hypeSeen.has(key)) return res.json({ hype: bot.hype, already: true });
    hypeSeen.add(key);
    if (hypeSeen.size > 100_000) hypeSeen.clear();
    const updated = store.updateBot(bot.id, (b) => ({ hype: (b.hype || 0) + 1 }));
    res.json({ hype: updated.hype });
  });

  app.get("/api/battle", (req, res) => {
    const a = loadBot(String(req.query.a || ""));
    const b = loadBot(String(req.query.b || ""));
    if (a.id === b.id) throw new HttpError(400, "Pick two different bots.");
    const days = [30, 90, 365].includes(Number(req.query.days)) ? Number(req.query.days) : 90;
    const m = market.get();
    const startDate = sinceDays(m, days);
    let benchmark = [];
    const fighters = [a, b].map((bot) => {
      const r = simulate(bot.strategy, m, { startDate });
      benchmark = r.benchmark;
      return {
        id: bot.id,
        name: bot.name,
        creator: bot.creator,
        sample: bot.sample,
        stats: r.stats,
        curve: downsample(r.curve, 120),
        rules: describeStrategy(bot.strategy, ASSETS.length),
      };
    });
    const [fa, fb] = fighters;
    const winner = fa.stats.returnPct === fb.stats.returnPct ? null : fa.stats.returnPct > fb.stats.returnPct ? fa.id : fb.id;
    res.json({ days, startDate, fighters, benchmark: downsample(benchmark, 120), winner, market: { source: m.source } });
  });

  app.post("/api/waitlist", writeLimit, (req, res) => {
    const input = parse(WaitlistInput, req.body);
    store.addToWaitlist(input);
    res.status(201).json({ ok: true });
  });

  app.get("/api/admin/stats", (req, res) => {
    if (!env.ADMIN_TOKEN || req.get("x-admin-token") !== env.ADMIN_TOKEN) throw new HttpError(403, "Forbidden.");
    const bots = store.bots();
    res.json({
      bots: bots.length,
      realBots: bots.filter((b) => !b.sample).length,
      totalHype: bots.reduce((n, b) => n + (b.hype || 0), 0),
      waitlist: store.waitlist(),
    });
  });

  app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

  // AdSense verifies publishers through /ads.txt.
  app.get("/ads.txt", (req, res) => {
    if (!env.ADSENSE_CLIENT) return res.status(404).type("text").send("");
    const pub = env.ADSENSE_CLIENT.replace(/^ca-/, "");
    res.type("text").send(`google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`);
  });

  app.get("/bot/:id", (req, res) => res.sendFile(path.join(publicDir, "bot.html")));
  app.use(express.static(publicDir, { extensions: ["html"] }));

  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues[0]?.message || "Invalid strategy." });
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON." });
    if (err.type === "entity.too.large") return res.status(413).json({ error: "Request is too large." });
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  });

  return app;
}
