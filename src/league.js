// The game itself: fans, coins, picks vs the AI, prediction markets, betting
// bots and watch-party rooms. Routes in app.js call into this.
import { fanBadges } from "./badges.js";
import { sanitizeRules, simulateBot } from "./bots.js";
import { buy, openAt, priceYes, sell } from "./lmsr.js";
import { commentaryFor, offlinePreview, winProbs } from "./offline.js";
import { SPORTS } from "./sports/teams.js";
import { newId } from "./store.js";

export const START_COINS = 1000;
export const DAILY_BONUS = 100;
export const REFERRAL_BONUS = 500;
export const MAX_TRADE = 5000;
export const REACTIONS = ["🔥", "😱", "😂", "👏", "💀", "🐐"];

export class GameError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const round2 = (n) => Math.round(n * 100) / 100;
const dayOf = (iso) => iso.slice(0, 10);
const BAD_WORDS = /\b(fuck|shit|bitch|cunt|nigg\w*|fag\w*|retard\w*)\b/gi;

export function createLeague({ store, sports, ai, pusher = null, now = () => Date.now() }) {
  const { db } = store;
  const tokenIndex = new Map(Object.values(db.fans).map((f) => [f.token, f.id]));
  const previewJobs = new Map();
  const viewers = new Map();
  const reactions = new Map();
  const lastChat = new Map();
  const lastReact = new Map();
  const commentaryBusy = new Set();
  const botCache = { version: null, results: new Map() };

  // ---------- Fans ----------

  function createFan({ handle, ref = null, sample = false }) {
    const clean = String(handle || "").trim();
    if (!/^[A-Za-z0-9_.-]{2,20}$/.test(clean)) throw new GameError(400, "Handles are 2-20 letters, numbers, dots, dashes or underscores.");
    const lower = clean.toLowerCase();
    if (Object.values(db.fans).some((f) => f.handle.toLowerCase() === lower)) throw new GameError(409, "That handle is taken. Try another.");
    const fan = {
      id: newId(),
      token: newId(24),
      handle: clean,
      createdAt: new Date(now()).toISOString(),
      coins: START_COINS,
      lastDaily: null,
      dailyStreak: 0,
      referredBy: null,
      referrals: 0,
      chatCount: 0,
      trades: 0,
      sample,
    };
    const referrer = ref ? db.fans[ref] : null;
    if (referrer && !sample) {
      fan.coins += REFERRAL_BONUS;
      fan.referredBy = referrer.id;
      referrer.coins = round2(referrer.coins + REFERRAL_BONUS);
      referrer.referrals++;
    }
    db.fans[fan.id] = fan;
    tokenIndex.set(fan.token, fan.id);
    store.save();
    return fan;
  }

  const fanByToken = (token) => (token && tokenIndex.has(token) ? db.fans[tokenIndex.get(token)] : null);

  function claimDaily(fan) {
    const today = dayOf(new Date(now()).toISOString());
    if (fan.lastDaily === today) throw new GameError(409, "Already claimed today. Come back tomorrow!");
    const yesterday = dayOf(new Date(now() - 86_400_000).toISOString());
    fan.dailyStreak = fan.lastDaily === yesterday ? fan.dailyStreak + 1 : 1;
    const bonus = DAILY_BONUS + 20 * Math.min(fan.dailyStreak - 1, 5);
    fan.coins = round2(fan.coins + bonus);
    fan.lastDaily = today;
    store.save();
    return { bonus, streak: fan.dailyStreak, coins: fan.coins };
  }

  // Removes a fan and everything tied to them (required for app stores).
  function deleteFan(fan) {
    for (const [key, p] of Object.entries(db.picks)) if (p.fanId === fan.id) delete db.picks[key];
    for (const [key, p] of Object.entries(db.positions)) if (p.fanId === fan.id) delete db.positions[key];
    for (const [id, b] of Object.entries(db.bots)) if (b.ownerId === fan.id) delete db.bots[id];
    for (const [gameId, msgs] of Object.entries(db.messages)) db.messages[gameId] = msgs.filter((m) => m.fanId !== fan.id);
    tokenIndex.delete(fan.token);
    delete db.fans[fan.id];
    botCache.results.clear();
    store.save();
  }

  function setPushToken(fan, pushToken) {
    fan.pushToken = pushToken;
    store.save();
  }

  // ---------- The AI's picks ----------

  // A preview counts as the AI's pick only if it was locked in before kickoff.
  function lockedPreview(game) {
    const p = db.previews[game.id];
    return p && p.createdAt <= game.startsAt ? p : null;
  }
  const preview = (game) => lockedPreview(game) ?? offlinePreview(game);
  const botPick = (game) => preview(game).pick;

  function lock(game, p) {
    if (db.previews[game.id] || game.status !== "scheduled") return;
    db.previews[game.id] = { ...p, createdAt: new Date(now()).toISOString() };
    store.save();
  }

  async function ensurePreview(game) {
    if (db.previews[game.id]) return lockedPreview(game) ?? offlinePreview(game);
    if (game.status !== "scheduled") return offlinePreview(game);
    if (ai.aiMode() === "demo") {
      lock(game, offlinePreview(game));
      return db.previews[game.id];
    }
    if (!previewJobs.has(game.id)) {
      previewJobs.set(
        game.id,
        ai.previewGame(game).then((p) => {
          lock(game, p);
          previewJobs.delete(game.id);
        }),
      );
    }
    await previewJobs.get(game.id);
    return preview(game);
  }

  // Locks the AI's picks for games starting soon, so they're on record before kickoff.
  function warmPreviews(limit = 12) {
    const soon = now() + 36 * 3_600_000;
    let queued = 0;
    for (const g of sports.games()) {
      if (g.status !== "scheduled" || Date.parse(g.startsAt) > soon || db.previews[g.id]) continue;
      if (queued++ >= limit) break;
      ensurePreview(g).catch(() => {});
    }
  }

  function botRecord(days = 7) {
    const since = new Date(now() - days * 86_400_000).toISOString();
    let won = 0;
    let lost = 0;
    for (const g of sports.games()) {
      if (g.status !== "final" || g.startsAt < since || g.winner === "draw") continue;
      if (botPick(g) === g.winner) won++;
      else lost++;
    }
    return { won, lost, days };
  }

  // ---------- Picks ----------

  function makePick(fan, game, side) {
    if (!["home", "away"].includes(side)) throw new GameError(400, "Pick home or away.");
    if (game.status !== "scheduled") throw new GameError(409, "This game has started. Picks are locked.");
    ensurePreview(game).catch(() => {});
    db.picks[`${fan.id}:${game.id}`] = { fanId: fan.id, gameId: game.id, side, at: new Date(now()).toISOString(), result: null };
    store.save();
  }

  function gradePicks() {
    let changed = false;
    for (const pick of Object.values(db.picks)) {
      if (pick.result) continue;
      const game = sports.game(pick.gameId);
      if (!game || game.status !== "final") continue;
      const probs = winProbs(game);
      const other = pick.side === "home" ? "away" : "home";
      const won = game.winner === pick.side;
      const underdog = probs[pick.side] < probs[other];
      const bot = botPick(game);
      Object.assign(pick, {
        result: won ? "won" : "lost",
        points: won ? 10 + (underdog ? 5 : 0) : 0,
        underdog,
        botPick: bot,
        botWon: game.winner === bot,
        startsAt: game.startsAt,
        sport: game.sport,
      });
      changed = true;
      const fan = db.fans[pick.fanId];
      if (pusher && fan?.pushToken) {
        const team = game[pick.side].short;
        pusher.send(fan.pushToken, {
          title: won ? `✅ ${team} won!` : `❌ ${team} lost`,
          body: won
            ? `Your pick hit for ${pick.points} points.${game.winner === bot ? "" : " You beat the Bot on this one 🤖"}`
            : game.winner === bot ? "The Bot got this one. Get it back today." : "The Bot missed it too.",
          url: `/game/${game.id}`,
        });
      }
    }
    if (changed) store.save();
  }

  function picksByFan() {
    const map = new Map();
    for (const p of Object.values(db.picks)) {
      if (!map.has(p.fanId)) map.set(p.fanId, []);
      map.get(p.fanId).push(p);
    }
    return map;
  }

  function statsFrom(picks) {
    const graded = picks.filter((p) => p.result).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const correct = graded.filter((p) => p.result === "won").length;
    let streak = 0;
    for (let i = graded.length - 1; i >= 0 && graded[i].result === "won"; i--) streak++;
    let best = 0;
    let run = 0;
    for (const p of graded) {
      run = p.result === "won" ? run + 1 : 0;
      best = Math.max(best, run);
    }
    const byDay = new Map();
    for (const p of graded) {
      const d = byDay.get(dayOf(p.startsAt)) || { you: 0, bot: 0, n: 0 };
      d.n++;
      if (p.result === "won") d.you++;
      if (p.botWon) d.bot++;
      byDay.set(dayOf(p.startsAt), d);
    }
    return {
      picks: picks.length,
      graded: graded.length,
      correct,
      accuracy: graded.length ? Math.round((correct / graded.length) * 1000) / 10 : null,
      points: graded.reduce((n, p) => n + (p.points || 0), 0),
      streak,
      bestStreak: best,
      upsets: graded.filter((p) => p.result === "won" && p.underdog).length,
      vsBot: { you: correct, bot: graded.filter((p) => p.botWon).length },
      beatBotDays: [...byDay.values()].filter((d) => d.n >= 3 && d.you > d.bot).length,
    };
  }

  // ---------- Prediction markets ----------

  function marketDefs(game) {
    const p = lockedPreview(game);
    const pHome = p ? (p.pick === "home" ? p.win_probability : 100 - p.win_probability) / 100 : winProbs(game).home;
    const defs = [
      {
        id: `${game.id}~ml`,
        kind: "ml",
        question: game.sport === "soccer" ? `Will ${game.home.short} win? (a draw resolves NO)` : `Will the ${game.home.short} beat the ${game.away.short}?`,
        open: pHome,
      },
    ];
    if (game.odds?.total != null) {
      defs.push({ id: `${game.id}~ou`, kind: "ou", question: `Over ${game.odds.total} total ${SPORTS[game.sport].unit}?`, open: 0.5, line: game.odds.total });
    }
    return defs;
  }

  function resolution(def, game) {
    if (game.status !== "final") return null;
    if (def.kind === "ml") return game.winner === "home" ? "yes" : "no";
    return game.home.score + game.away.score > def.line ? "yes" : "no";
  }

  const marketState = (def) => db.markets[def.id] ?? { ...openAt(def.open), volume: 0, trades: 0 };

  function markets(game, fan = null) {
    return marketDefs(game).map((def) => {
      const st = marketState(def);
      const mine = fan
        ? ["yes", "no"]
            .map((o) => db.positions[`${fan.id}:${def.id}:${o}`])
            .filter((p) => p && p.shares > 0.0001)
            .map((p) => ({ outcome: p.outcome, shares: round2(p.shares), cost: round2(p.cost), settled: p.settled, payout: p.payout ?? null }))
        : [];
      return {
        id: def.id,
        kind: def.kind,
        question: def.question,
        price: Math.round(priceYes(st) * 1000) / 1000,
        volume: Math.round(st.volume),
        trades: st.trades,
        status: game.status === "scheduled" ? "open" : game.status === "final" ? "resolved" : "closed",
        resolution: resolution(def, game),
        positions: mine,
      };
    });
  }

  function trade(fan, marketId, { action, outcome, coins, shares }) {
    const gameId = marketId.split("~")[0];
    const game = sports.game(gameId);
    const def = game && marketDefs(game).find((d) => d.id === marketId);
    if (!def) throw new GameError(404, "Market not found.");
    if (game.status !== "scheduled") throw new GameError(409, "Trading closed at kickoff.");
    if (!["yes", "no"].includes(outcome)) throw new GameError(400, "Choose YES or NO.");
    const key = `${fan.id}:${marketId}:${outcome}`;
    const pos = db.positions[key] ?? { fanId: fan.id, marketId, gameId, outcome, shares: 0, cost: 0, settled: false };
    const st = marketState(def);
    let next;
    if (action === "buy") {
      const spend = Math.floor(Number(coins));
      if (!(spend >= 1)) throw new GameError(400, "Spend at least 1 coin.");
      if (spend > MAX_TRADE) throw new GameError(400, `Max ${MAX_TRADE.toLocaleString()} coins per trade.`);
      if (spend > fan.coins) throw new GameError(400, "Not enough coins. Claim your daily bonus or win some picks!");
      const r = buy(st, outcome, spend);
      next = r.state;
      pos.shares += r.shares;
      pos.cost += spend;
      fan.coins = round2(fan.coins - spend);
      next.volume = (st.volume ?? 0) + spend;
    } else if (action === "sell") {
      const qty = Math.min(Number(shares) || pos.shares, pos.shares);
      if (!(qty > 0)) throw new GameError(400, "You don't hold any of those shares.");
      const r = sell(st, outcome, qty);
      next = r.state;
      pos.cost = pos.shares ? pos.cost * (1 - qty / pos.shares) : 0;
      pos.shares -= qty;
      fan.coins = round2(fan.coins + r.coins);
      next.volume = (st.volume ?? 0) + r.coins;
    } else {
      throw new GameError(400, "Action must be buy or sell.");
    }
    next.trades = (st.trades ?? 0) + 1;
    db.markets[marketId] = next;
    db.positions[key] = pos;
    fan.trades++;
    store.save();
    return { coins: fan.coins, market: markets(game, fan).find((m) => m.id === marketId) };
  }

  function settle() {
    let changed = false;
    for (const pos of Object.values(db.positions)) {
      if (pos.settled || pos.shares <= 0.0001) continue;
      const game = sports.game(pos.gameId);
      if (!game || game.status !== "final") continue;
      const def = marketDefs(game).find((d) => d.id === pos.marketId);
      const won = def && resolution(def, game) === pos.outcome;
      pos.payout = won ? round2(pos.shares) : 0;
      pos.settled = true;
      const fan = db.fans[pos.fanId];
      if (fan) fan.coins = round2(fan.coins + pos.payout);
      changed = true;
    }
    if (changed) store.save();
  }

  function netWorth(fan) {
    let total = fan.coins;
    for (const pos of Object.values(db.positions)) {
      if (pos.fanId !== fan.id || pos.settled || pos.shares <= 0.0001) continue;
      const game = sports.game(pos.gameId);
      const def = game && marketDefs(game).find((d) => d.id === pos.marketId);
      if (!def) continue;
      const pYes = priceYes(marketState(def));
      total += pos.shares * (pos.outcome === "yes" ? pYes : 1 - pYes);
    }
    return Math.round(total);
  }

  // ---------- Profiles & leaderboards ----------

  function profile(fan, picks = null) {
    gradePicks();
    settle();
    const mine = picks ?? Object.values(db.picks).filter((p) => p.fanId === fan.id);
    const stats = statsFrom(mine);
    const worth = netWorth(fan);
    return {
      id: fan.id,
      handle: fan.handle,
      sample: fan.sample,
      coins: Math.floor(fan.coins),
      netWorth: worth,
      stats,
      badges: fanBadges(fan, stats, worth),
      referrals: fan.referrals,
      dailyStreak: fan.dailyStreak,
      canClaimDaily: fan.lastDaily !== dayOf(new Date(now()).toISOString()),
    };
  }

  function pickers(limit = 100) {
    gradePicks();
    settle();
    const grouped = picksByFan();
    return Object.values(db.fans)
      .map((f) => ({ fan: f, picks: grouped.get(f.id) || [] }))
      .filter((x) => x.picks.some((p) => p.result))
      .map((x) => profile(x.fan, x.picks))
      .sort((a, b) => b.stats.points - a.stats.points || (b.stats.accuracy ?? 0) - (a.stats.accuracy ?? 0))
      .slice(0, limit)
      .map((p, i) => ({ ...p, rank: i + 1 }));
  }

  function traders(limit = 100) {
    settle();
    return Object.values(db.fans)
      .filter((f) => f.trades > 0)
      .map((f) => ({ id: f.id, handle: f.handle, sample: f.sample, netWorth: netWorth(f), coins: Math.floor(f.coins), trades: f.trades }))
      .sort((a, b) => b.netWorth - a.netWorth)
      .slice(0, limit)
      .map((p, i) => ({ ...p, rank: i + 1 }));
  }

  // ---------- Betting bots ----------

  function createBot(fan, { name, prompt, rules, sample = false, createdAt = null }) {
    const bot = {
      id: newId(),
      ownerId: fan.id,
      creator: fan.handle,
      name: String(name).trim().slice(0, 40),
      prompt: String(prompt || "").slice(0, 600),
      rules: sanitizeRules({ ...rules, name }),
      createdAt: createdAt ?? new Date(now()).toISOString(),
      hype: 0,
      sample,
    };
    db.bots[bot.id] = bot;
    store.save();
    return bot;
  }

  function botResult(bot) {
    if (botCache.version !== sports.version) {
      botCache.version = sports.version;
      botCache.results.clear();
    }
    if (!botCache.results.has(bot.id)) {
      botCache.results.set(bot.id, simulateBot(bot.rules, sports.games(), { since: bot.createdAt, botPick }));
    }
    return botCache.results.get(bot.id);
  }

  const backtest = (rules, days = 30) =>
    simulateBot(rules, sports.games(), { since: new Date(now() - days * 86_400_000).toISOString(), botPick });

  function botsBoard(limit = 100) {
    return Object.values(db.bots)
      .map((b) => {
        const r = botResult(b);
        return {
          id: b.id,
          name: b.name,
          creator: b.creator,
          sample: b.sample,
          summary: b.rules.summary,
          createdAt: b.createdAt,
          hype: b.hype,
          stats: r.stats,
          spark: r.curve.slice(-40).map((p) => p.equity),
        };
      })
      .sort((a, b) => b.stats.profit - a.stats.profit)
      .slice(0, limit)
      .map((b, i) => ({ ...b, rank: i + 1 }));
  }

  // ---------- Watch-party rooms ----------

  function pushMessage(gameId, msg) {
    const list = (db.messages[gameId] ||= []);
    db.msgSeq = (db.msgSeq || 0) + 1;
    list.push({ n: db.msgSeq, at: new Date(now()).toISOString(), ...msg });
    if (list.length > 300) list.splice(0, list.length - 300);
    const rooms = Object.keys(db.messages);
    if (rooms.length > 400) {
      const cutoff = new Date(now() - 3 * 86_400_000).toISOString();
      for (const id of rooms) if ((db.messages[id].at(-1)?.at ?? "") < cutoff) delete db.messages[id];
    }
    store.save();
  }

  function commentate(game) {
    const msgs = db.messages[game.id] || [];
    const last = msgs.findLast?.((m) => m.kind === "ai" && m.state) ?? [...msgs].reverse().find((m) => m.kind === "ai" && m.state);
    const moment = commentaryFor(game, last?.state ?? null);
    if (!moment) return;
    const state = { home: game.home.score ?? 0, away: game.away.score ?? 0, status: game.status };
    pushMessage(game.id, { kind: "ai", handle: "Clutch AI", text: moment.text, state });
    if ((moment.kind === "lead" || moment.kind === "final") && ai.aiMode() === "live" && !commentaryBusy.has(game.id)) {
      commentaryBusy.add(game.id);
      ai.commentate(game, moment)
        .then((line) => line && pushMessage(game.id, { kind: "ai", handle: "Clutch AI", text: `🎙️ ${line}` }))
        .finally(() => commentaryBusy.delete(game.id));
    }
  }

  function room(game, { since = 0, viewerKey }) {
    const seen = viewers.get(game.id) || new Map();
    seen.set(viewerKey, now());
    viewers.set(game.id, seen);
    for (const [k, t] of seen) if (now() - t > 30_000) seen.delete(k);
    commentate(game);
    const msgs = (db.messages[game.id] || []).filter((m) => m.n > Number(since || 0) && !m.hidden).slice(-60);
    return {
      messages: msgs.map(({ fanId, state, reports, ...m }) => m),
      reactions: reactions.get(game.id) || {},
      watching: seen.size,
    };
  }

  function chat(fan, game, raw) {
    const last = lastChat.get(fan.id) || 0;
    if (now() - last < 2_000) throw new GameError(429, "Easy, you're typing too fast!");
    const text = String(raw || "")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 280)
      .replace(BAD_WORDS, (w) => "*".repeat(w.length));
    if (!text) throw new GameError(400, "Say something!");
    lastChat.set(fan.id, now());
    fan.chatCount = (fan.chatCount || 0) + 1;
    pushMessage(game.id, { kind: "chat", fanId: fan.id, handle: fan.handle, text });
  }

  // Fans can report a chat message; three reports hide it for everyone.
  function report(game, n, reporterKey) {
    const msg = (db.messages[game.id] || []).find((m) => m.n === Number(n) && m.kind === "chat");
    if (!msg) throw new GameError(404, "Message not found.");
    msg.reports = [...new Set([...(msg.reports || []), reporterKey])].slice(0, 20);
    if (msg.reports.length >= 3) msg.hidden = true;
    store.save();
    return { hidden: !!msg.hidden };
  }

  function react(game, emoji, key) {
    if (!REACTIONS.includes(emoji)) throw new GameError(400, "Unknown reaction.");
    const k = `${key}:${game.id}`;
    if (now() - (lastReact.get(k) || 0) < 700) return reactions.get(game.id) || {};
    lastReact.set(k, now());
    if (lastReact.size > 50_000) lastReact.clear();
    const counts = reactions.get(game.id) || {};
    counts[emoji] = (counts[emoji] || 0) + 1;
    reactions.set(game.id, counts);
    return counts;
  }

  return {
    createFan,
    fanByToken,
    claimDaily,
    deleteFan,
    setPushToken,
    preview,
    ensurePreview,
    warmPreviews,
    botPick,
    botRecord,
    makePick,
    gradePicks,
    markets,
    trade,
    settle,
    profile,
    pickers,
    traders,
    createBot,
    botResult,
    backtest,
    botsBoard,
    room,
    chat,
    report,
    react,
    netWorth,
  };
}
