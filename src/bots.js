// Betting bots: simple rules that "bet" play coins on every matching game.
// Rules are data, never code. A bot's record is a replay of its rules over
// finished games, so it's deterministic and can't be edited after the fact.
import { z } from "zod";
import { americanToDecimal, impliedProb } from "./odds.js";
import { SPORT_KEYS } from "./sports/teams.js";

export const PICKS = ["favorite", "underdog", "home", "away", "ai_pick", "fade_ai"];

export const BotRulesSchema = z.object({
  name: z.string().describe("Catchy 1-3 word bot name"),
  summary: z.string().describe("One plain-English sentence describing the strategy"),
  sports: z.array(z.enum(SPORT_KEYS)).describe("Sports the bot bets on"),
  pick: z.enum(PICKS).describe("Which side of each game the bot backs"),
  min_prob: z.number().nullable().describe("Only bet when the chosen side's implied win chance is at least this % (0-100); null for no limit"),
  max_prob: z.number().nullable().describe("Only bet when the chosen side's implied win chance is at most this % (0-100); null for no limit"),
  stake: z.number().describe("Coins risked per bet"),
});

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function sanitizeRules(input) {
  const r = BotRulesSchema.parse(input);
  const sports = [...new Set(r.sports)];
  let min = r.min_prob == null ? null : clamp(r.min_prob, 1, 99);
  let max = r.max_prob == null ? null : clamp(r.max_prob, 1, 99);
  if (min != null && max != null && min > max) [min, max] = [max, min];
  return {
    name: r.name.trim().slice(0, 40) || "Unnamed Bot",
    summary: r.summary.trim().slice(0, 240),
    sports: sports.length ? sports : [...SPORT_KEYS],
    pick: r.pick,
    min_prob: min,
    max_prob: max,
    stake: Math.round(clamp(r.stake, 10, 1000)),
  };
}

// Which side a bot backs in a game, or null to skip it.
function chooseSide(rules, game, botPick) {
  const { homeML, awayML } = game.odds;
  switch (rules.pick) {
    case "favorite":
      return homeML <= awayML ? "home" : "away";
    case "underdog":
      return homeML <= awayML ? "away" : "home";
    case "home":
    case "away":
      return rules.pick;
    case "ai_pick":
      return botPick(game);
    case "fade_ai":
      return botPick(game) === "home" ? "away" : "home";
    default:
      return null;
  }
}

// Replays a bot over finished games that started on/after `since`.
// botPick(game) returns the AI's pick ("home" | "away") for the AI-based rules.
export function simulateBot(rules, games, { since = null, until = null, botPick }) {
  const bets = [];
  let profit = 0;
  let wins = 0;
  const curve = [];
  for (const g of games) {
    if (g.status !== "final" || !rules.sports.includes(g.sport)) continue;
    if (since && g.startsAt < since) continue;
    if (until && g.startsAt >= until) continue;
    if (g.odds?.homeML == null || g.odds?.awayML == null) continue;
    const side = chooseSide(rules, g, botPick);
    if (!side) continue;
    const ml = g.odds[`${side}ML`];
    const prob = impliedProb(ml) * 100;
    if (rules.min_prob != null && prob < rules.min_prob) continue;
    if (rules.max_prob != null && prob > rules.max_prob) continue;
    const won = g.winner === side;
    const result = won ? rules.stake * (americanToDecimal(ml) - 1) : -rules.stake;
    profit += result;
    if (won) wins++;
    bets.push({ gameId: g.id, sport: g.sport, startsAt: g.startsAt, side, team: g[side].name, ml, won, result: Math.round(result) });
    curve.push({ date: g.startsAt.slice(0, 10), equity: Math.round(profit) });
  }
  const staked = bets.length * rules.stake;
  return {
    bets,
    curve,
    stats: {
      bets: bets.length,
      wins,
      losses: bets.length - wins,
      winPct: bets.length ? Math.round((wins / bets.length) * 1000) / 10 : null,
      profit: Math.round(profit),
      roiPct: staked ? Math.round((profit / staked) * 1000) / 10 : null,
    },
  };
}

export const TEMPLATES = [
  { label: "🐶 Underdog hunter", text: "Bet every underdog with at least a 35% chance to win, 100 coins a game." },
  { label: "🏠 Home sweet home", text: "Always bet the home team in basketball and hockey." },
  { label: "🤖 Ride the AI", text: "Back whatever the AI picks in every sport." },
  { label: "🙃 Fade the AI", text: "Bet against the AI's pick every single game." },
  { label: "🔒 Heavy favorites", text: "Only bet favorites with at least a 70% chance to win, 200 coins each." },
  { label: "⚽ Soccer dogs", text: "Bet soccer underdogs, 50 coins a game." },
];
