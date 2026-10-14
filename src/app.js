import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { z } from "zod";
import * as defaultAi from "./ai.js";
import { BotRulesSchema, TEMPLATES, sanitizeRules } from "./bots.js";
import { DAILY_BONUS, GameError, REACTIONS, START_COINS } from "./league.js";
import { isExpoToken } from "./push.js";
import { tokensMatch } from "./store.js";
import { SPORTS, SPORT_KEYS } from "./sports/teams.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, "..", "public");
export const APP_NAME = "Clutch";

const FanInput = z.object({ handle: z.string().trim().max(20), ref: z.string().max(20).nullable().optional() });
const TextInput = z.object({ text: z.string().trim().min(8, "Describe your bot in a sentence or two.").max(600) });
const BacktestInput = z.object({ rules: BotRulesSchema, days: z.coerce.number().int().min(7).max(40).default(30) });
const BotInput = z.object({ name: z.string().trim().min(2, "Give your bot a name.").max(40), prompt: z.string().trim().max(600).default(""), rules: BotRulesSchema });
const TradeInput = z.object({
  action: z.enum(["buy", "sell"]),
  outcome: z.enum(["yes", "no"]),
  coins: z.coerce.number().optional(),
  shares: z.coerce.number().optional(),
});
const WaitlistInput = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email.").max(120),
  plan: z.enum(["pro", "partner", "sponsor"]).default("pro"),
});

function parse(schema, body) {
  const result = schema.safeParse(body ?? {});
  if (!result.success) throw new GameError(400, result.error.issues[0]?.message || "Invalid input.");
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

export function createApp({ league, sports, ai = defaultAi, store, limits = {}, env = process.env }) {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));

  const joinLimit = rateLimit({ windowMs: 10 * 60_000, max: limits.join ?? 10 });
  const aiLimit = rateLimit({ windowMs: 10 * 60_000, max: limits.ai ?? 40 });
  const writeLimit = rateLimit({ windowMs: 10 * 60_000, max: limits.write ?? 400 });

  const fanOf = (req) => league.fanByToken(req.get("x-fan-token"));
  function requireFan(req) {
    const fan = fanOf(req);
    if (!fan) throw new GameError(401, "Pick a handle to play.");
    return fan;
  }
  function loadGame(id) {
    const game = sports.game(id);
    if (!game) throw new GameError(404, "Game not found.");
    return game;
  }
  function loadGroup(id) {
    const group = store.db.groups[id];
    if (!group) throw new GameError(404, "League not found.");
    return group;
  }
  function loadBot(id) {
    const bot = store.db.bots[id];
    if (!bot) throw new GameError(404, "Bot not found.");
    return bot;
  }

  function botSummary(game) {
    const p = league.preview(game);
    return { pick: p.pick, win_probability: p.win_probability, upset_alert: p.upset_alert, headline: p.headline, source: p.source };
  }

  function gameCard(game, fan) {
    const ml = league.markets(game).find((m) => m.kind === "ml");
    const pick = fan ? store.db.picks[`${fan.id}:${game.id}`] : null;
    return { ...game, bot: botSummary(game), myPick: pick?.side ?? null, homeWinPrice: ml?.price ?? null };
  }

  // The iPhone/Android app identifies itself in its user agent. App stores
  // restrict gambling promotion and Google doesn't allow AdSense in apps, so
  // the app gets neither.
  const inApp = (req) => /Clutch(IOS|Android|App)/.test(req.get("user-agent") || "");
  const partner = (req) =>
    env.SPORTSBOOK_URL && !inApp(req)
      ? {
          name: env.SPORTSBOOK_NAME || "our sportsbook partner",
          url: env.SPORTSBOOK_URL,
          terms: env.SPORTSBOOK_TERMS || "21+ and present in a legal state. Gambling problem? Call 1-800-GAMBLER.",
        }
      : null;

  // ---------- Config ----------

  // Used by hosts (Render, Docker) to check the server is up.
  app.get("/api/health", (req, res) => {
    res.json({ ok: true, games: sports.source, ai: ai.aiMode() });
  });

  app.get("/api/config", (req, res) => {
    res.json({
      appName: APP_NAME,
      contactEmail: env.CONTACT_EMAIL || null,
      aiMode: ai.aiMode(),
      source: sports.source,
      sports: SPORTS,
      reactions: REACTIONS,
      templates: TEMPLATES,
      startCoins: START_COINS,
      dailyBonus: DAILY_BONUS,
      partner: partner(req),
      inApp: inApp(req),
      ads: {
        adsenseClient: inApp(req) ? null : env.ADSENSE_CLIENT || null,
        adsenseSlot: inApp(req) ? null : env.ADSENSE_SLOT || null,
        sponsor: env.SPONSOR_NAME ? { name: env.SPONSOR_NAME, text: env.SPONSOR_TEXT || "", url: env.SPONSOR_URL || "#" } : null,
      },
    });
  });

  // ---------- Fans ----------

  app.post("/api/fans", joinLimit, (req, res) => {
    const input = parse(FanInput, req.body);
    const fan = league.createFan({ handle: input.handle, ref: input.ref });
    res.status(201).json({ token: fan.token, profile: league.profile(fan) });
  });

  app.get("/api/me", (req, res) => {
    const fan = requireFan(req);
    const profile = league.profile(fan);
    const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const picks = Object.values(store.db.picks)
      .filter((p) => p.fanId === fan.id)
      .map((p) => ({ ...p, game: sports.game(p.gameId) }))
      .filter((p) => p.game && p.game.startsAt >= since)
      .map((p) => ({
        gameId: p.gameId,
        side: p.side,
        result: p.result,
        botPick: p.botPick ?? league.botPick(p.game),
        botWon: p.botWon ?? null,
        startsAt: p.game.startsAt,
        matchup: `${p.game.away.short} @ ${p.game.home.short}`,
      }))
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
    const positions = Object.values(store.db.positions)
      .filter((p) => p.fanId === fan.id && p.shares > 0.0001)
      .slice(-30)
      .map((p) => {
        const g = sports.game(p.gameId);
        return {
          marketId: p.marketId,
          gameId: p.gameId,
          outcome: p.outcome,
          shares: Math.round(p.shares * 100) / 100,
          cost: Math.round(p.cost),
          settled: p.settled,
          payout: p.payout ?? null,
          matchup: g ? `${g.away.short} @ ${g.home.short}` : p.gameId,
          status: g?.status ?? "final",
        };
      })
      .reverse();
    const bots = Object.values(store.db.bots)
      .filter((b) => b.ownerId === fan.id)
      .map((b) => ({ id: b.id, name: b.name, stats: league.botResult(b).stats }));
    const groups = league.groupsOf(fan).map((g) => ({
      id: g.id,
      name: g.name,
      members: g.members.length,
      rank: league.groupStandings(g).find((r) => r.id === fan.id)?.rank ?? null,
    }));
    res.json({ profile, token: fan.token, picks, positions, bots, groups });
  });

  app.delete("/api/me", writeLimit, (req, res) => {
    league.deleteFan(requireFan(req));
    res.json({ ok: true });
  });

  app.post("/api/me/push", writeLimit, (req, res) => {
    const fan = requireFan(req);
    const pushToken = req.body?.token;
    if (pushToken !== null && !isExpoToken(pushToken)) throw new GameError(400, "Invalid push token.");
    league.setPushToken(fan, pushToken);
    res.json({ ok: true });
  });

  app.post("/api/me/daily", writeLimit, (req, res) => {
    res.json(league.claimDaily(requireFan(req)));
  });

  // ---------- Games ----------

  app.get("/api/games", (req, res) => {
    const fan = fanOf(req);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : new Date().toISOString().slice(0, 10);
    const tz = Math.max(-840, Math.min(840, Number(req.query.tz) || 0));
    const from = Date.parse(`${date}T00:00:00Z`) + tz * 60_000;
    const to = from + 86_400_000;
    const sport = SPORT_KEYS.includes(req.query.sport) ? req.query.sport : null;
    league.gradePicks();
    league.warmPreviews();
    const games = sports
      .games()
      .filter((g) => {
        const t = Date.parse(g.startsAt);
        return t >= from && t < to && (!sport || g.sport === sport);
      })
      .map((g) => gameCard(g, fan));
    res.json({ games, source: sports.source, botRecord: league.botRecord(7) });
  });

  app.get("/api/games/:id", aiLimit, async (req, res) => {
    const game = loadGame(req.params.id);
    const fan = fanOf(req);
    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), 20_000);
    });
    const preview = (await Promise.race([league.ensurePreview(game), timeout])) ?? league.preview(game);
    clearTimeout(timer);
    const pick = fan ? store.db.picks[`${fan.id}:${game.id}`] : null;
    res.json({ game, preview, markets: league.markets(game, fan), myPick: pick?.side ?? null, coins: fan ? Math.floor(fan.coins) : null, partner: partner(req) });
  });

  app.post("/api/games/:id/pick", writeLimit, (req, res) => {
    const fan = requireFan(req);
    const game = loadGame(req.params.id);
    league.makePick(fan, game, req.body?.side);
    res.json({ myPick: req.body.side, bot: botSummary(game) });
  });

  app.post("/api/markets/:id/trade", writeLimit, (req, res) => {
    const fan = requireFan(req);
    res.json(league.trade(fan, req.params.id, parse(TradeInput, req.body)));
  });

  // ---------- Watch party ----------

  app.get("/api/games/:id/room", (req, res) => {
    const game = loadGame(req.params.id);
    const fan = fanOf(req);
    const room = league.room(game, { since: Number(req.query.since) || 0, viewerKey: fan?.id ?? req.ip });
    res.json({ game, ...room });
  });

  app.post("/api/games/:id/chat", writeLimit, (req, res) => {
    const fan = requireFan(req);
    league.chat(fan, loadGame(req.params.id), req.body?.text);
    res.status(201).json({ ok: true });
  });

  app.post("/api/games/:id/report", writeLimit, (req, res) => {
    const game = loadGame(req.params.id);
    res.json(league.report(game, req.body?.n, fanOf(req)?.id ?? req.ip));
  });

  app.post("/api/games/:id/react", writeLimit, (req, res) => {
    const game = loadGame(req.params.id);
    res.json({ reactions: league.react(game, req.body?.emoji, fanOf(req)?.id ?? req.ip) });
  });

  // ---------- Friend leagues ----------

  app.post("/api/groups", writeLimit, (req, res) => {
    const group = league.createGroup(requireFan(req), req.body?.name);
    res.status(201).json({ id: group.id });
  });

  app.get("/api/groups/:id", (req, res) => {
    const group = loadGroup(req.params.id);
    const fan = fanOf(req);
    res.json({
      group: { id: group.id, name: group.name, createdAt: group.createdAt, members: group.members.length, owner: store.db.fans[group.ownerId]?.handle ?? null },
      standings: league.groupStandings(group),
      isMember: !!fan && group.members.includes(fan.id),
      botRecord: league.botRecord(7),
    });
  });

  app.post("/api/groups/:id/join", writeLimit, (req, res) => {
    league.joinGroup(requireFan(req), loadGroup(req.params.id));
    res.json({ ok: true });
  });

  app.post("/api/groups/:id/leave", writeLimit, (req, res) => {
    league.leaveGroup(requireFan(req), loadGroup(req.params.id));
    res.json({ ok: true });
  });

  // ---------- Betting bots ----------

  app.post("/api/bots/compile", aiLimit, async (req, res) => {
    const { text } = parse(TextInput, req.body);
    res.json(await ai.compileBot(text));
  });

  app.post("/api/bots/backtest", (req, res) => {
    const input = parse(BacktestInput, req.body);
    const rules = sanitizeRules(input.rules);
    const result = league.backtest(rules, input.days);
    res.json({ rules, days: input.days, stats: result.stats, curve: result.curve, bets: result.bets.slice(-25).reverse() });
  });

  app.post("/api/bots", writeLimit, (req, res) => {
    const fan = requireFan(req);
    const input = parse(BotInput, req.body);
    const bot = league.createBot(fan, input);
    res.status(201).json({ id: bot.id });
  });

  app.get("/api/bots/:id", (req, res) => {
    const bot = loadBot(req.params.id);
    const live = league.botResult(bot);
    const backtest = league.backtest(bot.rules, 30);
    const rank = league.botsBoard(1000).find((b) => b.id === bot.id)?.rank ?? null;
    res.json({
      bot: { id: bot.id, name: bot.name, creator: bot.creator, prompt: bot.prompt, rules: bot.rules, createdAt: bot.createdAt, hype: bot.hype, sample: bot.sample, rank },
      live: { stats: live.stats, curve: live.curve, bets: live.bets.slice(-25).reverse() },
      backtest: { stats: backtest.stats, curve: backtest.curve },
    });
  });

  app.post("/api/bots/:id/hype", writeLimit, (req, res) => {
    const bot = loadBot(req.params.id);
    bot.hype = (bot.hype || 0) + 1;
    store.save();
    res.json({ hype: bot.hype });
  });

  // ---------- Leaderboards ----------

  app.get("/api/leaderboard", (req, res) => {
    const board = ["pickers", "traders", "bots"].includes(req.query.board) ? req.query.board : "pickers";
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const rows = board === "pickers" ? league.pickers(limit) : board === "traders" ? league.traders(limit) : league.botsBoard(limit);
    res.json({ board, rows, botRecord: league.botRecord(7) });
  });

  // ---------- Money ----------

  app.post("/api/waitlist", writeLimit, (req, res) => {
    const input = parse(WaitlistInput, req.body);
    const existing = store.db.waitlist.find((w) => w.email === input.email);
    if (existing) Object.assign(existing, input);
    else store.db.waitlist.push({ ...input, createdAt: new Date().toISOString() });
    store.save();
    res.status(201).json({ ok: true });
  });

  app.get("/api/admin/stats", (req, res) => {
    if (!env.ADMIN_TOKEN || !tokensMatch(req.get("x-admin-token"), env.ADMIN_TOKEN)) throw new GameError(403, "Forbidden.");
    const fans = Object.values(store.db.fans).filter((f) => !f.sample);
    const real = new Set(fans.map((f) => f.id));
    res.json({
      fans: fans.length,
      picks: Object.values(store.db.picks).filter((p) => real.has(p.fanId)).length,
      bots: Object.values(store.db.bots).filter((b) => !b.sample).length,
      trades: fans.reduce((n, f) => n + f.trades, 0),
      reportedMessages: Object.values(store.db.messages).flat().filter((m) => m.reports?.length).map(({ handle, text, reports, hidden }) => ({ handle, text, reports: reports.length, hidden: !!hidden })),
      waitlist: store.db.waitlist,
    });
  });

  app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

  app.get("/ads.txt", (req, res) => {
    if (!env.ADSENSE_CLIENT) return res.status(404).type("text").send("");
    res.type("text").send(`google.com, ${env.ADSENSE_CLIENT.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n`);
  });

  // ---------- Pages with link previews ----------
  // Shared links show a title, description and image in chats and social apps.

  const templates = new Map();
  const attr = (v) => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  function sendPage(req, res, file, { title, description }) {
    if (!templates.has(file)) templates.set(file, fs.readFileSync(path.join(publicDir, file), "utf8"));
    const origin = `${req.protocol}://${req.get("host")}`;
    const tags = [
      `<title>${attr(title)}</title>`,
      `<meta name="description" content="${attr(description)}">`,
      `<meta property="og:type" content="website">`,
      `<meta property="og:site_name" content="${APP_NAME}">`,
      `<meta property="og:title" content="${attr(title)}">`,
      `<meta property="og:description" content="${attr(description)}">`,
      `<meta property="og:url" content="${attr(origin + req.originalUrl)}">`,
      `<meta property="og:image" content="${origin}/icons/og.png">`,
      `<meta property="og:image:width" content="1200">`,
      `<meta property="og:image:height" content="630">`,
      `<meta name="twitter:card" content="summary_large_image">`,
    ].join("\n  ");
    // Drop the page's static tags first, then put the specific ones in place of <title>.
    const html = templates
      .get(file)
      .replace(/\s*<meta (name="description"|property="og:[a-z:]+") content="[^"]*">/g, "")
      .replace(/<title>[^<]*<\/title>/, tags);
    res.type("html").send(html);
  }

  const DEFAULT_META = {
    title: "Clutch: can you beat the AI at sports?",
    description: "Free daily sports picks against an AI, a fan prediction market, betting-bot battles and live watch parties. All in one app.",
  };

  app.get("/", (req, res) => sendPage(req, res, "index.html", DEFAULT_META));

  app.get("/game/:id", (req, res) => {
    const g = sports.game(req.params.id);
    if (!g) return sendPage(req, res, "game.html", DEFAULT_META);
    const p = league.preview(g);
    const pick = g[p.pick].short;
    const matchup = `${g.away.short} @ ${g.home.short}`;
    const description =
      g.status === "scheduled"
        ? `The AI picks the ${pick} (${p.win_probability}%). Think you can beat it? Make your pick on Clutch.`
        : g.status === "live"
          ? `LIVE: ${g.away.short} ${g.away.score}, ${g.home.short} ${g.home.score} (${g.clock}). Join the watch party on Clutch.`
          : `Final: ${g.away.short} ${g.away.score}, ${g.home.short} ${g.home.score}. The AI picked the ${pick} ${g.winner === p.pick ? "✅" : "❌"}.`;
    sendPage(req, res, "game.html", { title: `${matchup} · Clutch`, description });
  });

  app.get("/bot/:id", (req, res) => {
    const bot = store.db.bots[req.params.id];
    if (!bot) return sendPage(req, res, "bot.html", DEFAULT_META);
    const { profit } = league.botResult(bot).stats;
    sendPage(req, res, "bot.html", {
      title: `${bot.name} by @${bot.creator} · Clutch`,
      description: `${bot.rules.summary} Profit so far: ${profit >= 0 ? "+" : ""}${profit} coins. Build a bot that beats it on Clutch.`,
    });
  });

  app.get("/l/:id", (req, res) => {
    const group = store.db.groups[req.params.id];
    if (!group) return sendPage(req, res, "group.html", DEFAULT_META);
    sendPage(req, res, "group.html", {
      title: `Join ${group.name} on Clutch`,
      description: `${group.members.length} fan${group.members.length === 1 ? "" : "s"} competing to beat the AI at sports. Free to play. Tap to join.`,
    });
  });

  app.use(express.static(publicDir, { extensions: ["html"] }));

  app.use((err, req, res, next) => {
    if (err instanceof GameError) return res.status(err.status).json({ error: err.message });
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues[0]?.message || "Invalid input." });
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON." });
    if (err.type === "entity.too.large") return res.status(413).json({ error: "Request is too large." });
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  });

  return app;
}
