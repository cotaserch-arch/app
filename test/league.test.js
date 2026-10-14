import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createApp } from "../src/app.js";
import { createLeague, START_COINS } from "../src/league.js";
import { offlinePreview, parseBotOffline } from "../src/offline.js";
import { seedSamples } from "../src/seed.js";
import { buildDemoSchedule } from "../src/sports/demo.js";
import { createStore } from "../src/store.js";

// A sports provider whose games the test controls.
function fakeSports() {
  const games = new Map(buildDemoSchedule(Date.UTC(2026, 9, 14, 12)).map((g) => [g.id, structuredClone(g)]));
  let version = 0;
  return {
    source: "demo",
    get version() {
      return `t:${version}`;
    },
    games: () => [...games.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    game: (id) => games.get(id) || null,
    finish(id, home, away) {
      const g = games.get(id);
      Object.assign(g, { status: "final", clock: "Final", winner: home > away ? "home" : away > home ? "away" : "draw" });
      g.home.score = home;
      g.away.score = away;
      version++;
    },
    goLive(id) {
      const g = games.get(id);
      Object.assign(g, { status: "live", clock: "Q1 12:00" });
      g.home.score = 0;
      g.away.score = 0;
      version++;
    },
  };
}

const fakeAi = {
  aiMode: () => "demo",
  previewGame: async (g) => offlinePreview(g),
  compileBot: async (text) => ({ ...parseBotOffline(text), source: "demo" }),
  commentate: async () => null,
};

test("fans, referrals and daily coins", () => {
  const sports = fakeSports();
  const store = createStore(null);
  const league = createLeague({ store, sports, ai: fakeAi });
  const a = league.createFan({ handle: "alpha" });
  assert.equal(a.coins, START_COINS);
  assert.throws(() => league.createFan({ handle: "ALPHA" }), /taken/);
  assert.throws(() => league.createFan({ handle: "x" }), /2-20/);
  const b = league.createFan({ handle: "bravo", ref: a.id });
  assert.equal(b.coins, START_COINS + 500);
  assert.equal(a.coins, START_COINS + 500);
  assert.equal(league.fanByToken(b.token).id, b.id);
  const daily = league.claimDaily(a);
  assert.equal(daily.bonus, 100);
  assert.throws(() => league.claimDaily(a), /Already claimed/);
});

test("picks lock at kickoff and score with an upset bonus", () => {
  const sports = fakeSports();
  const store = createStore(null);
  const league = createLeague({ store, sports, ai: fakeAi });
  const fan = league.createFan({ handle: "picker" });
  const upcoming = sports.games().filter((g) => g.status === "scheduled");
  const [g1, g2] = upcoming;
  const dog1 = offlinePreview(g1).pick === "home" ? "away" : "home";
  league.makePick(fan, g1, dog1);
  league.makePick(fan, g2, "home");
  assert.equal(store.db.previews[g1.id].pick, offlinePreview(g1).pick, "the AI's pick is locked when a fan picks");
  sports.finish(g1.id, dog1 === "home" ? 3 : 1, dog1 === "home" ? 1 : 3);
  sports.finish(g2.id, 0, 5);
  const p = league.profile(fan);
  assert.equal(p.stats.graded, 2);
  assert.equal(p.stats.correct, 1);
  assert.equal(p.stats.points, 15, "10 for a win + 5 upset bonus");
  assert.equal(p.stats.upsets, 1);
  assert.throws(() => league.makePick(fan, sports.game(g1.id), "home"), /locked/);
});

test("markets trade before kickoff, close at kickoff and pay winners", () => {
  const sports = fakeSports();
  const store = createStore(null);
  const league = createLeague({ store, sports, ai: fakeAi });
  const yes = league.createFan({ handle: "yes_fan" });
  const no = league.createFan({ handle: "no_fan" });
  const g = sports.games().find((x) => x.status === "scheduled");
  const id = `${g.id}~ml`;
  const before = league.markets(g)[0].price;
  const r = league.trade(yes, id, { action: "buy", outcome: "yes", coins: 200 });
  assert.equal(r.coins, START_COINS - 200);
  assert.ok(r.market.price > before);
  league.trade(no, id, { action: "buy", outcome: "no", coins: 100 });
  assert.throws(() => league.trade(yes, id, { action: "buy", outcome: "yes", coins: 99999 }), /Max|Not enough/);
  const shares = r.market.positions[0].shares;
  sports.goLive(g.id);
  assert.throws(() => league.trade(yes, id, { action: "buy", outcome: "yes", coins: 10 }), /closed/);
  sports.finish(g.id, 4, 1);
  league.settle();
  assert.ok(Math.abs(yes.coins - (START_COINS - 200 + shares)) < 0.02, "each YES share pays 1 coin");
  assert.equal(no.coins, START_COINS - 100);
  assert.equal(league.markets(sports.game(g.id))[0].resolution, "yes");
  league.settle();
  assert.ok(Math.abs(yes.coins - (START_COINS - 200 + shares)) < 0.02, "settles only once");
});

test("watch-party chat, commentary and reactions", () => {
  const sports = fakeSports();
  const store = createStore(null);
  let clock = Date.now();
  const league = createLeague({ store, sports, ai: fakeAi, now: () => clock });
  const fan = league.createFan({ handle: "chatty" });
  const g = sports.games().find((x) => x.status === "scheduled");
  sports.goLive(g.id);
  const first = league.room(sports.game(g.id), { viewerKey: "v1" });
  assert.match(first.messages[0].text, /We're live/);
  league.chat(fan, sports.game(g.id), "here we go");
  assert.throws(() => league.chat(fan, sports.game(g.id), "again"), /too fast/);
  // A score change produces a new AI call on the next poll, and only once.
  const live = sports.game(g.id);
  live.home.score = g.sport === "basketball" ? 12 : g.sport === "football" ? 7 : 1;
  const next = league.room(live, { since: first.messages.at(-1).n, viewerKey: "v1" });
  const calls = next.messages.filter((m) => m.kind === "ai");
  assert.equal(calls.length, 1);
  assert.match(calls[0].text, new RegExp(live.home.short));
  assert.equal(league.room(live, { since: next.messages.at(-1).n, viewerKey: "v1" }).messages.length, 0);
});

test("chat masks bad words and rejects empty messages", () => {
  const sports = fakeSports();
  const store = createStore(null);
  let clock = Date.now();
  const league = createLeague({ store, sports, ai: fakeAi, now: () => clock });
  const fan = league.createFan({ handle: "chatty2" });
  const g = sports.games().find((x) => x.status === "scheduled");
  sports.goLive(g.id);
  league.chat(fan, sports.game(g.id), "what a game shit");
  clock += 3000;
  assert.throws(() => league.chat(fan, sports.game(g.id), "   "), /Say something/);
  const room = league.room(sports.game(g.id), { viewerKey: "v1" });
  const chat = room.messages.find((m) => m.kind === "chat");
  assert.equal(chat.text, "what a game ****");
  assert.equal(chat.fanId, undefined, "fan ids aren't exposed");
  assert.equal(league.react(sports.game(g.id), "🔥", "k")["🔥"], 1);
  assert.throws(() => league.react(sports.game(g.id), "💩", "k"), /Unknown/);
  assert.equal(room.watching, 1);
});

// ---------- HTTP API ----------

let server;
let base;
let sports;
before(async () => {
  sports = fakeSports();
  const store = createStore(null);
  const league = createLeague({ store, sports, ai: fakeAi });
  seedSamples(league, { store, sports, now: Date.UTC(2026, 9, 14, 12) });
  const app = createApp({ league, sports, store, ai: fakeAi, limits: { join: 100, ai: 1000, write: 1000 }, env: { ADMIN_TOKEN: "secret", SPORTSBOOK_URL: "https://partner.example/ref", SPORTSBOOK_NAME: "PartnerBook" } });
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

async function call(path, { method = "GET", body, token, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { "x-fan-token": token } : {}), ...headers },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

test("API: join, games, pick, trade, bots, leaderboards, admin", async () => {
  const join = await call("/api/fans", { method: "POST", body: { handle: "api_fan" } });
  assert.equal(join.status, 201);
  const token = join.data.token;

  const games = await call("/api/games?date=2026-10-14&tz=0", { token });
  assert.ok(games.data.games.length >= 10);
  const g = games.data.games.find((x) => x.status === "scheduled");
  assert.ok(["home", "away"].includes(g.bot.pick));

  assert.equal((await call(`/api/games/${g.id}/pick`, { method: "POST", body: { side: "home" } })).status, 401, "must join first");
  assert.equal((await call(`/api/games/${g.id}/pick`, { method: "POST", token, body: { side: "home" } })).status, 200);

  const detail = await call(`/api/games/${g.id}`, { token });
  assert.equal(detail.data.myPick, "home");
  assert.equal(detail.data.partner.name, "PartnerBook");
  assert.equal(detail.data.markets.length, 2);

  const trade = await call(`/api/markets/${encodeURIComponent(`${g.id}~ou`)}/trade`, { method: "POST", token, body: { action: "buy", outcome: "yes", coins: 100 } });
  assert.equal(trade.status, 200);
  assert.equal(trade.data.coins, 900);

  const compiled = await call("/api/bots/compile", { method: "POST", body: { text: "Bet every basketball underdog, 50 coins a game" } });
  const bt = await call("/api/bots/backtest", { method: "POST", body: { rules: compiled.data.rules, days: 30 } });
  assert.ok(bt.data.stats.bets > 10);
  const bot = await call("/api/bots", { method: "POST", token, body: { name: "Hoop Dogs", prompt: "test", rules: compiled.data.rules } });
  assert.equal(bot.status, 201);
  const botPage = await call(`/api/bots/${bot.data.id}`);
  assert.equal(botPage.data.bot.name, "Hoop Dogs");
  assert.equal(botPage.data.bot.rules.name, "Hoop Dogs");

  const me = await call("/api/me", { token });
  assert.equal(me.data.profile.handle, "api_fan");
  assert.equal(me.data.picks.length, 1);
  assert.equal(me.data.positions.length, 1);
  assert.equal(me.data.bots.length, 1);

  for (const board of ["pickers", "traders", "bots"]) {
    const lb = await call(`/api/leaderboard?board=${board}`);
    assert.equal(lb.status, 200);
    assert.ok(lb.data.rows.length > 0, board);
  }
  const pickers = (await call("/api/leaderboard?board=pickers")).data.rows;
  assert.ok(pickers.every((r, i) => i === 0 || pickers[i - 1].stats.points >= r.stats.points));

  assert.equal((await call("/api/waitlist", { method: "POST", body: { email: "fan@example.com", plan: "pro" } })).status, 201);
  assert.equal((await call("/api/admin/stats")).status, 403);
  const admin = await call("/api/admin/stats", { headers: { "x-admin-token": "secret" } });
  assert.equal(admin.data.fans, 1, "sample fans aren't counted");
  assert.equal(admin.data.waitlist.length, 1);
});

test("API: watch party room and validation", async () => {
  const { data } = await call("/api/fans", { method: "POST", body: { handle: "room_fan" } });
  const g = sports.games().find((x) => x.status === "scheduled" && x.startsAt > "2026-10-14T18");
  sports.goLive(g.id);
  const room = await call(`/api/games/${g.id}/room`);
  assert.match(room.data.messages[0].text, /We're live/);
  assert.equal((await call(`/api/games/${g.id}/chat`, { method: "POST", token: data.token, body: { text: "LETS GO" } })).status, 201);
  const after = await call(`/api/games/${g.id}/room?since=${room.data.messages.at(-1).n}`);
  assert.deepEqual(after.data.messages.map((m) => m.text), ["LETS GO"]);
  assert.equal((await call("/api/games/nope")).status, 404);
  assert.equal((await call("/api/fans", { method: "POST", body: { handle: "<script>" } })).status, 400);
  assert.equal((await call("/api/bots/compile", { method: "POST", body: { text: "hi" } })).status, 400);
});

test("deleting a profile removes everything tied to it", async () => {
  const { data } = await call("/api/fans", { method: "POST", body: { handle: "leaver" } });
  const g = sports.games().find((x) => x.status === "scheduled");
  await call(`/api/games/${g.id}/pick`, { method: "POST", token: data.token, body: { side: "away" } });
  await call(`/api/markets/${encodeURIComponent(`${g.id}~ml`)}/trade`, { method: "POST", token: data.token, body: { action: "buy", outcome: "no", coins: 10 } });
  assert.equal((await call("/api/me/push", { method: "POST", token: data.token, body: { token: "bad" } })).status, 400);
  assert.equal((await call("/api/me/push", { method: "POST", token: data.token, body: { token: "ExponentPushToken[abcdefghijkl]" } })).status, 200);
  assert.equal((await call("/api/me", { method: "DELETE", token: data.token })).status, 200);
  assert.equal((await call("/api/me", { token: data.token })).status, 401);
  assert.equal((await call("/api/fans", { method: "POST", body: { handle: "leaver" } })).status, 201, "the handle is free again");
});

test("the iPhone app never sees sportsbook links or AdSense", async () => {
  const web = await call("/api/config");
  assert.equal(web.data.partner.name, "PartnerBook");
  const app = await call("/api/config", { headers: { "user-agent": "Mozilla/5.0 (iPhone) ClutchIOS/1.0" } });
  assert.equal(app.data.partner, null);
  assert.equal(app.data.inApp, true);
  assert.equal(app.data.ads.adsenseClient, null);
});

test("reported messages disappear after three reports", async () => {
  const fans = [];
  for (const h of ["rep_a", "rep_b", "rep_c", "rep_d"]) fans.push((await call("/api/fans", { method: "POST", body: { handle: h } })).data.token);
  const g = sports.games().find((x) => x.status === "scheduled" && x.startsAt > "2026-10-15");
  sports.goLive(g.id);
  await call(`/api/games/${g.id}/chat`, { method: "POST", token: fans[0], body: { text: "something nasty" } });
  const msg = (await call(`/api/games/${g.id}/room`)).data.messages.find((m) => m.kind === "chat");
  for (const t of [fans[1], fans[1], fans[2]]) await call(`/api/games/${g.id}/report`, { method: "POST", token: t, body: { n: msg.n } });
  assert.ok((await call(`/api/games/${g.id}/room`)).data.messages.some((m) => m.n === msg.n), "duplicate reports from one fan count once");
  const last = await call(`/api/games/${g.id}/report`, { method: "POST", token: fans[3], body: { n: msg.n } });
  assert.equal(last.data.hidden, true);
  assert.ok(!(await call(`/api/games/${g.id}/room`)).data.messages.some((m) => m.n === msg.n));
  const admin = await call("/api/admin/stats", { headers: { "x-admin-token": "secret" } });
  assert.equal(admin.data.reportedMessages[0].reports, 3);
});

test("friend leagues: create, join, standings from join time, leave", async () => {
  const owner = (await call("/api/fans", { method: "POST", body: { handle: "league_boss" } })).data.token;
  const friend = (await call("/api/fans", { method: "POST", body: { handle: "league_pal" } })).data.token;
  assert.equal((await call("/api/groups", { method: "POST", token: owner, body: { name: " " } })).status, 400);
  const { id } = (await call("/api/groups", { method: "POST", token: owner, body: { name: "Sunday   Squad" } })).data;
  assert.equal((await call(`/api/groups/${id}/join`, { method: "POST", body: {} })).status, 401);
  assert.equal((await call(`/api/groups/${id}/join`, { method: "POST", token: friend, body: {} })).status, 200);

  // Both pick a future game; the owner's pick wins.
  const g = sports.games().find((x) => x.status === "scheduled" && x.startsAt > "2026-10-15T06");
  await call(`/api/games/${g.id}/pick`, { method: "POST", token: owner, body: { side: "home" } });
  await call(`/api/games/${g.id}/pick`, { method: "POST", token: friend, body: { side: "away" } });
  sports.finish(g.id, 3, 1);

  const view = await call(`/api/groups/${id}`, { token: friend });
  assert.equal(view.data.group.name, "Sunday Squad");
  assert.equal(view.data.group.members, 2);
  assert.equal(view.data.isMember, true);
  assert.deepEqual(view.data.standings.map((r) => [r.handle, r.rank, r.stats.graded]), [["league_boss", 1, 1], ["league_pal", 2, 1]]);
  assert.ok(view.data.standings[0].stats.points >= 10);

  const me = await call("/api/me", { token: friend });
  assert.deepEqual(me.data.groups.map((x) => [x.name, x.rank]), [["Sunday Squad", 2]]);
  await call(`/api/groups/${id}/leave`, { method: "POST", token: friend, body: {} });
  assert.equal((await call(`/api/groups/${id}`)).data.group.members, 1);
  assert.equal((await call("/api/groups/nope")).status, 404);
});

test("shared links get a specific title, description and image", async () => {
  const g = sports.games().find((x) => x.status === "scheduled");
  const html = await (await fetch(`${base}/game/${g.id}`)).text();
  assert.match(html, new RegExp(`<title>${g.away.short} @ ${g.home.short} · Clutch</title>`));
  assert.match(html, /<meta property="og:description" content="The AI picks the [^"]+\(\d+%\)\. Think you can beat it\?/);
  assert.match(html, /<meta property="og:image" content="http:\/\/127\.0\.0\.1:\d+\/icons\/og\.png">/);
  assert.equal((html.match(/property="og:title"/g) || []).length, 1, "no duplicate tags");
  const home = await (await fetch(`${base}/`)).text();
  assert.match(home, /<meta name="twitter:card" content="summary_large_image">/);
  const missing = await fetch(`${base}/l/does-not-exist`);
  assert.equal(missing.status, 200, "unknown ids still load the page, which shows not-found");
});

test("health check", async () => {
  const { status, data } = await call("/api/health");
  assert.equal(status, 200);
  assert.deepEqual(data, { ok: true, games: "demo", ai: "demo" });
});

test("serves every page", async () => {
  for (const path of ["/", "/bots", "/leaders", "/pro", "/me", "/privacy", "/game/x", "/bot/x", "/l/x", "/manifest.webmanifest", "/sw.js", "/icons/og.png"]) {
    assert.equal((await fetch(base + path)).status, 200, path);
  }
});
