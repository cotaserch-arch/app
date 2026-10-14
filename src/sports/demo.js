// The demo league: a deterministic schedule of fictional teams across five
// sports, with a game starting every 90 minutes around the clock so there is
// always something live. Every result is fixed by its game id, so the same
// game always plays out the same way.
import { lineFor } from "../odds.js";
import { SPORTS, SPORT_KEYS, demoTeams } from "./teams.js";

const DAY = 86_400_000;
const EPOCH = Date.UTC(2026, 0, 1);
const HISTORY_DAYS = 40;
const FUTURE_DAYS = 3;
const GAMES_PER_DAY = { football: 2, basketball: 4, baseball: 4, hockey: 3, soccer: 3 };
const HOME_EDGE = 0.15;
const K = { football: 2.2, basketball: 2.6, baseball: 1.1, hockey: 1.2, soccer: 1.6 };

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(rand, mean) {
  const limit = Math.exp(-Math.max(0.05, mean));
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > limit);
  return k - 1;
}

function normal(rand) {
  const u = Math.max(rand(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

const logistic = (x) => 1 / (1 + Math.exp(-x));
const strength = (teamId) => {
  const r = rng(hash(`strength:${teamId}`));
  return (r() + r() + r()) / 1.5 - 1;
};

export function demoWinProbs(sport, homeId, awayId) {
  const diff = strength(homeId) - strength(awayId) + HOME_EDGE;
  if (sport === "soccer") {
    const draw = Math.max(0.16, 0.27 - 0.1 * Math.abs(diff));
    const home = (1 - draw) * logistic(K.soccer * diff);
    return { home, away: 1 - draw - home, draw };
  }
  const home = logistic(K[sport] * diff);
  return { home, away: 1 - home, draw: 0 };
}

function scoringEvents(sport, diff, rand) {
  const events = [];
  const add = (side, pts, t = 0.01 + rand() * 0.95) => events.push({ t, side, pts });
  for (const side of ["home", "away"]) {
    const d = side === "home" ? diff : -diff;
    if (sport === "football") {
      const tds = poisson(rand, 2.5 + 0.9 * d);
      const fgs = poisson(rand, 1.6 + 0.3 * d);
      for (let i = 0; i < tds; i++) add(side, rand() < 0.08 ? 6 : rand() < 0.06 ? 8 : 7);
      for (let i = 0; i < fgs; i++) add(side, 3);
    } else if (sport === "basketball") {
      let left = Math.max(80, Math.round(111 + 7 * d + 10 * normal(rand)));
      while (left > 0) {
        const pts = left >= 3 && rand() < 0.36 ? 3 : left >= 2 && rand() < 0.86 ? 2 : 1;
        add(side, pts);
        left -= pts;
      }
    } else if (sport === "baseball") {
      let runs = poisson(rand, 4.4 + 1.2 * d);
      while (runs > 0) {
        const r = Math.min(runs, rand() < 0.62 ? 1 : rand() < 0.7 ? 2 : 3);
        add(side, r);
        runs -= r;
      }
    } else {
      const goals = poisson(rand, sport === "hockey" ? 3.0 + 0.7 * d : 1.35 + 0.55 * d);
      for (let i = 0; i < goals; i++) add(side, 1);
    }
  }
  events.sort((a, b) => a.t - b.t);

  const total = (side) => events.reduce((n, e) => n + (e.side === side ? e.pts : 0), 0);
  let overtime = false;
  if (sport !== "soccer" && total("home") === total("away")) {
    overtime = true;
    const winner = rand() < logistic(K[sport] * diff) ? "home" : "away";
    const loser = winner === "home" ? "away" : "home";
    if (sport === "basketball") {
      const base = 8 + Math.floor(rand() * 6);
      add(loser, base, 0.975);
      add(winner, base + 1 + Math.floor(rand() * 6), 0.985);
    } else {
      add(winner, sport === "football" ? 3 : 1, 0.98);
    }
  }
  return { events, overtime };
}

function clockFor(sport, p, overtime) {
  if (overtime && p >= 0.97) return "OT";
  const part = (n) => Math.min(n, Math.floor(p * n) + 1);
  const mmss = (minutes, n) => {
    const left = (1 - ((p * n) % 1)) * minutes;
    return `${Math.floor(left)}:${String(Math.floor((left % 1) * 60)).padStart(2, "0")}`;
  };
  switch (sport) {
    case "football":
      return `Q${part(4)} ${mmss(15, 4)}`;
    case "basketball":
      return `Q${part(4)} ${mmss(12, 4)}`;
    case "hockey":
      return `P${part(3)} ${mmss(20, 3)}`;
    case "baseball": {
      const half = Math.min(17, Math.floor(p * 18));
      const inning = Math.floor(half / 2) + 1;
      const suffix = ["th", "st", "nd", "rd"][inning % 10 > 3 || [11, 12, 13].includes(inning) ? 0 : inning % 10];
      return `${half % 2 ? "Bot" : "Top"} ${inning}${suffix}`;
    }
    default:
      return `${Math.min(90, Math.floor(p * 90) + 1)}'`;
  }
}

function totalLine(sport, sh, sa) {
  const base = { football: 46, basketball: 221, baseball: 8, hockey: 6, soccer: 2 }[sport];
  const adj = { football: 3, basketball: 6, baseball: 0, hockey: 0, soccer: 0 }[sport];
  return Math.floor(base + adj * (sh + sa)) + 0.5;
}

function formatRecord(sport, r) {
  if (sport === "hockey") return `${r.w}-${r.l}-${r.t}`;
  if (sport === "soccer") return `${r.w}-${r.t}-${r.l}`;
  return `${r.w}-${r.l}`;
}

export function buildDemoSchedule(now = Date.now()) {
  const today = Math.floor((now - EPOCH) / DAY);
  const raw = [];
  for (let day = today - HISTORY_DAYS; day <= today + FUTURE_DAYS; day++) {
    const slots = SPORT_KEYS.flatMap((sport) => Array.from({ length: GAMES_PER_DAY[sport] }, (_, n) => [sport, n]));
    slots.sort((a, b) => hash(`${day}:${a}`) - hash(`${day}:${b}`));
    slots.forEach(([sport, n], slot) => {
      const teams = [...demoTeams(sport)].sort((a, b) => hash(`${day}:${sport}:${a.id}`) - hash(`${day}:${sport}:${b.id}`));
      const [home, away] = [teams[2 * n], teams[2 * n + 1]];
      const start = EPOCH + day * DAY + slot * 90 * 60_000 + 15 * 60_000;
      raw.push({ day, sport, n, home, away, start, end: start + SPORTS[sport].minutes * 60_000 });
    });
  }
  raw.sort((a, b) => a.start - b.start);

  const records = new Map();
  const recordOf = (id) => records.get(id) || { w: 0, l: 0, t: 0 };
  const games = raw.map((g) => {
    const id = `demo-${g.sport}-${g.day}-${g.n}`;
    const sh = strength(g.home.id);
    const sa = strength(g.away.id);
    const { events, overtime } = scoringEvents(g.sport, sh - sa + HOME_EDGE, rng(hash(id)));
    const probs = demoWinProbs(g.sport, g.home.id, g.away.id);
    const status = now < g.start ? "scheduled" : now < g.end ? "live" : "final";
    const p = status === "final" ? 1 : status === "live" ? (now - g.start) / (g.end - g.start) : 0;
    const score = (side) => events.reduce((sum, e) => sum + (e.side === side && e.t <= p ? e.pts : 0), 0);
    const hs = score("home");
    const as = score("away");
    const winner = status !== "final" ? null : hs > as ? "home" : as > hs ? "away" : "draw";

    const game = {
      id,
      source: "demo",
      sport: g.sport,
      league: `Demo ${SPORTS[g.sport].label} League`,
      startsAt: new Date(g.start).toISOString(),
      status,
      clock: status === "live" ? clockFor(g.sport, p, overtime) : status === "final" ? (overtime && g.sport !== "soccer" ? "Final/OT" : "Final") : null,
      home: { ...g.home, record: formatRecord(g.sport, recordOf(g.home.id)), score: status === "scheduled" ? null : hs },
      away: { ...g.away, record: formatRecord(g.sport, recordOf(g.away.id)), score: status === "scheduled" ? null : as },
      odds: {
        homeML: lineFor(probs.home),
        awayML: lineFor(probs.away),
        drawML: probs.draw ? lineFor(probs.draw) : null,
        total: totalLine(g.sport, sh, sa),
      },
      winner,
      overtime: status === "final" && overtime,
    };

    if (status === "final") {
      for (const [side, other] of [["home", "away"], ["away", "home"]]) {
        const r = { ...recordOf(game[side].id) };
        if (winner === side) r.w++;
        else if (winner === "draw" || (overtime && g.sport === "hockey" && winner === other)) r.t++;
        else r.l++;
        records.set(game[side].id, r);
      }
    }
    return game;
  });
  return games;
}
