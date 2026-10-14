import assert from "node:assert/strict";
import { test } from "node:test";
import { simulateBot, sanitizeRules } from "../src/bots.js";
import { buy, openAt, priceYes, sell } from "../src/lmsr.js";
import { americanToDecimal, fairProbs, impliedProb, lineFor } from "../src/odds.js";
import { commentaryFor, offlinePreview, parseBotOffline } from "../src/offline.js";
import { buildDemoSchedule } from "../src/sports/demo.js";
import { createPusher, isExpoToken } from "../src/push.js";
import { parseScoreboard } from "../src/sports/espn.js";

const game = (over = {}) => ({
  id: "g1",
  sport: "basketball",
  status: "final",
  startsAt: "2026-10-10T20:00:00.000Z",
  home: { name: "Home Team", short: "Home", abbr: "HOM", record: "5-1", score: 100 },
  away: { name: "Away Team", short: "Away", abbr: "AWY", record: "2-4", score: 90 },
  odds: { homeML: -200, awayML: 170, total: 200.5 },
  winner: "home",
  ...over,
});

test("odds math", () => {
  assert.equal(americanToDecimal(-200), 1.5);
  assert.equal(americanToDecimal(150), 2.5);
  assert.ok(Math.abs(impliedProb(-200) - 2 / 3) < 1e-9);
  const fair = fairProbs({ homeML: -110, awayML: -110 });
  assert.ok(Math.abs(fair.home - 0.5) < 1e-9);
  assert.equal(lineFor(0.5), -110);
});

test("LMSR market: opens at the given odds, moves with trades, round-trips", () => {
  const s = openAt(0.6);
  assert.ok(Math.abs(priceYes(s) - 0.6) < 1e-9);
  const b = buy(s, "yes", 300);
  assert.ok(priceYes(b.state) > 0.6, "buying YES raises the price");
  assert.ok(b.shares > 300, "shares cost less than 1 coin each");
  const back = sell(b.state, "yes", b.shares);
  assert.ok(Math.abs(back.coins - 300) < 1e-6, "selling everything returns the same coins");
  assert.ok(Math.abs(priceYes(back.state) - 0.6) < 1e-9);
  const n = buy(s, "no", 300);
  assert.ok(priceYes(n.state) < 0.6, "buying NO lowers the YES price");
});

test("bots bet the right side and settle at the moneyline", () => {
  const games = [
    game({ id: "a", winner: "home" }),
    game({ id: "b", winner: "away" }),
    game({ id: "c", status: "scheduled", winner: null }),
    game({ id: "d", sport: "hockey", winner: "home" }),
  ];
  const fav = simulateBot(sanitizeRules({ name: "F", summary: "", sports: ["basketball"], pick: "favorite", min_prob: null, max_prob: null, stake: 100 }), games, { botPick: () => "home" });
  assert.equal(fav.stats.bets, 2, "only finished basketball games");
  assert.equal(fav.stats.profit, 50 - 100);
  const dog = simulateBot(sanitizeRules({ name: "D", summary: "", sports: ["basketball"], pick: "underdog", min_prob: null, max_prob: null, stake: 100 }), games, { botPick: () => "home" });
  assert.equal(dog.stats.profit, -100 + 170);
  const fade = simulateBot(sanitizeRules({ name: "X", summary: "", sports: ["basketball"], pick: "fade_ai", min_prob: null, max_prob: null, stake: 100 }), games, { botPick: () => "home" });
  assert.deepEqual(fade.bets.map((b) => b.side), ["away", "away"]);
  const picky = simulateBot(sanitizeRules({ name: "P", summary: "", sports: ["basketball"], pick: "underdog", min_prob: 40, max_prob: null, stake: 100 }), games, { botPick: () => "home" });
  assert.equal(picky.stats.bets, 0, "underdog at +170 is only ~37%");
});

test("offline bot parser", () => {
  const r = (t) => parseBotOffline(t).rules;
  assert.deepEqual(r("Bet hockey and soccer underdogs with at least a 35% chance, 50 coins a game").sports, ["hockey", "soccer"]);
  assert.equal(r("Bet hockey and soccer underdogs with at least a 35% chance, 50 coins a game").min_prob, 35);
  assert.equal(r("Bet hockey and soccer underdogs with at least a 35% chance, 50 coins a game").stake, 50);
  assert.equal(r("Only bet heavy favorites").min_prob, 70);
  assert.equal(r("Fade the AI in the NBA").pick, "fade_ai");
  assert.equal(r("Ride the AI every game").pick, "ai_pick");
  assert.equal(r("Always bet the road team").pick, "away");
  const unclear = parseBotOffline("make me money");
  assert.equal(unclear.rules.pick, "favorite");
  assert.ok(unclear.notes.length);
});

test("offline preview picks the favorite and flags close games", () => {
  const p = offlinePreview(game({ status: "scheduled" }));
  assert.equal(p.pick, "home");
  assert.ok(p.win_probability >= 60 && p.win_probability <= 70);
  assert.equal(offlinePreview(game({ odds: { homeML: -170, awayML: 145 } })).upset_alert, true, "a real underdog");
  assert.equal(offlinePreview(game({ odds: { homeML: -120, awayML: 100 } })).upset_alert, false, "a coin flip isn't an upset");
  assert.equal(offlinePreview(game({ odds: { homeML: -600, awayML: 450 } })).upset_alert, false, "a long shot isn't an alert");
});

test("commentary calls scores, lead changes and finals", () => {
  const live = game({ status: "live", sport: "football", clock: "Q2 5:00", home: { ...game().home, score: 7 }, away: { ...game().away, score: 10 } });
  assert.match(commentaryFor(live, null).text, /We're live/);
  const td = commentaryFor({ ...live, home: { ...live.home, score: 14 } }, { home: 7, away: 10, status: "live" });
  assert.match(td.text, /Lead change! 🏈 TOUCHDOWN Home/);
  assert.equal(commentaryFor(live, { home: 7, away: 10, status: "live" }), null);
  assert.match(commentaryFor(game(), { home: 98, away: 90, status: "live" }).text, /FINAL/);
});

test("demo league is deterministic and consistent over time", () => {
  const t = Date.UTC(2026, 5, 1, 12);
  const a = buildDemoSchedule(t);
  const b = buildDemoSchedule(t + 60 * 60_000);
  assert.ok(a.length > 600);
  const byId = new Map(b.map((g) => [g.id, g]));
  for (const g of a) {
    const later = byId.get(g.id);
    if (!later) continue;
    assert.equal(later.startsAt, g.startsAt);
    if (g.status === "final") assert.deepEqual([later.home.score, later.away.score, later.winner], [g.home.score, g.away.score, g.winner]);
    if (g.status === "live") assert.ok(later.home.score >= g.home.score && later.away.score >= g.away.score, "scores only go up");
  }
  for (const g of a.filter((x) => x.status === "final")) {
    assert.ok(g.winner);
    if (g.sport !== "soccer") assert.notEqual(g.winner, "draw");
  }
  assert.ok(a.some((g) => g.status === "live"), "something is always on");
});

test("parses ESPN scoreboards (old and new odds formats)", () => {
  const ev = (id, state, odds) => ({
    id,
    date: "2026-10-12T17:00Z",
    status: { type: { state, shortDetail: state === "post" ? "Final/OT" : state === "in" ? "Q3 4:12" : "1:00 PM ET" } },
    competitions: [{
      competitors: [
        { homeAway: "home", score: "24", winner: state === "post", team: { id: "1", abbreviation: "KC", displayName: "Kansas City Chiefs", shortDisplayName: "Chiefs", logo: "https://x/kc.png" }, records: [{ summary: "5-1" }] },
        { homeAway: "away", score: "21", winner: false, team: { id: "2", abbreviation: "BUF", displayName: "Buffalo Bills", shortDisplayName: "Bills" }, records: [{ summary: "4-2" }] },
      ],
      odds: odds ? [odds] : undefined,
    }],
  });
  const games = parseScoreboard({
    events: [
      ev("101", "post", { overUnder: 47.5, homeTeamOdds: { moneyLine: -150 }, awayTeamOdds: { moneyLine: 130 } }),
      ev("102", "pre", { overUnder: 44.5, moneyline: { home: { close: { odds: "-120" } }, away: { close: { odds: "+100" } } } }),
      ev("103", "in", null),
    ],
  }, "football");
  assert.equal(games.length, 3);
  const [final, pre, live] = games;
  assert.equal(final.id, "espn-football-101");
  assert.equal(final.status, "final");
  assert.equal(final.winner, "home");
  assert.equal(final.overtime, true);
  assert.deepEqual([final.home.abbr, final.home.score, final.home.record], ["KC", 24, "5-1"]);
  assert.deepEqual([final.odds.homeML, final.odds.awayML, final.odds.total], [-150, 130, 47.5]);
  assert.deepEqual([pre.odds.homeML, pre.odds.awayML], [-120, 100]);
  assert.equal(pre.home.score, null);
  assert.equal(live.status, "live");
  assert.equal(live.odds, null);
});

test("push notifications batch through Expo", async () => {
  const sent = [];
  const pusher = createPusher({ fetchImpl: async (url, opts) => (sent.push({ url, body: JSON.parse(opts.body) }), { ok: true }), log: {} });
  assert.equal(isExpoToken("ExponentPushToken[abcdefghijkl]"), true);
  assert.equal(isExpoToken("not-a-token"), false);
  pusher.send("not-a-token", { title: "x", body: "y" });
  pusher.send("ExponentPushToken[abcdefghijkl]", { title: "✅ Won", body: "Nice", url: "/game/1" });
  await pusher.flush();
  assert.equal(sent.length, 1);
  assert.match(sent[0].url, /exp\.host/);
  assert.deepEqual(sent[0].body.map((m) => [m.to, m.title, m.data.url]), [["ExponentPushToken[abcdefghijkl]", "✅ Won", "/game/1"]]);
});
