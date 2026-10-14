// Offline versions of the AI features: a line-based game model, a rule-based
// bot parser, and template commentary. Used in demo mode (no API key) and as a
// backup when an AI call fails.
import { sanitizeRules } from "./bots.js";
import { fairProbs, formatML } from "./odds.js";
import { SPORTS, SPORT_KEYS } from "./sports/teams.js";

function recordPct(record) {
  const parts = String(record || "").split("-").map(Number);
  if (parts.length < 2 || parts.some(Number.isNaN)) return null;
  const [w, a, b = 0] = parts;
  const games = w + a + b;
  return games ? w / games : null;
}

export function winProbs(game) {
  const fair = fairProbs(game.odds);
  if (fair) return fair;
  const h = recordPct(game.home.record);
  const a = recordPct(game.away.record);
  const home = h != null && a != null ? Math.min(0.85, Math.max(0.15, 0.53 + (h - a) * 0.6)) : 0.54;
  return { home, away: 1 - home, draw: 0 };
}

export function offlinePreview(game) {
  const probs = winProbs(game);
  const pick = probs.home >= probs.away ? "home" : "away";
  const other = pick === "home" ? "away" : "home";
  const team = game[pick];
  const opp = game[other];
  const pct = Math.round(probs[pick] * 100);
  const dogPct = Math.round(probs[other] * 100);
  const ml = game.odds?.[`${pick}ML`];
  const headline =
    pct >= 75 ? `${team.short} should cruise` : pct >= 60 ? `${team.short} have the edge` : pct >= 52 ? `${team.short} by a nose` : `Coin flip, leaning ${team.short}`;
  const where = pick === "home" ? `host the ${opp.short}` : `visit the ${opp.short}`;
  const recs = team.record && opp.record ? ` (${team.record} vs ${opp.record})` : "";
  const line = ml != null ? ` The line has them at ${formatML(ml)}, which works out to about a ${pct}% win chance once the bookmaker's cut is removed.` : ` The model gives them about a ${pct}% win chance.`;
  const draw = probs.draw ? ` A draw is live too (${Math.round(probs.draw * 100)}%).` : "";
  return {
    pick,
    win_probability: pct,
    headline,
    analysis: `The ${team.name} ${where}${recs}.${line}${draw}`,
    key_factor: pick === "home" ? "Home field and the better line" : "The stronger side, even on the road",
    // A real underdog with a live chance, not a coin flip.
    upset_alert: game.sport === "soccer" ? dogPct >= 30 && pct - dogPct >= 8 : dogPct >= 36 && dogPct <= 45,
    source: "model",
  };
}

// ---------- Bot parser ----------

const SPORT_WORDS = {
  football: /\b(football|nfl|gridiron)\b/,
  basketball: /\b(basketball|nba|hoops)\b/,
  baseball: /\b(baseball|mlb)\b/,
  hockey: /\b(hockey|nhl)\b/,
  soccer: /\b(soccer|premier league|epl|futbol|fútbol)\b/,
};

export function parseBotOffline(rawText) {
  const text = rawText.toLowerCase();
  const notes = [];
  let sports = SPORT_KEYS.filter((s) => SPORT_WORDS[s].test(text));
  if (!sports.length || /\b(every|all|any) sports?\b/.test(text)) sports = [...SPORT_KEYS];

  let pick = null;
  if (/\b(fade|against|opposite of|bet against)\b[^.]*\b(ai|bot)\b/.test(text)) pick = "fade_ai";
  else if (/\b(ai|bot)('s)?\s+(pick|picks)\b|\b(ride|follow|back|copy|trust)\b[^.]*\b(ai|bot)\b/.test(text)) pick = "ai_pick";
  else if (/\b(underdogs?|dogs?|long ?shots?)\b/.test(text)) pick = "underdog";
  else if (/\b(favou?rites?|chalk)\b/.test(text)) pick = "favorite";
  else if (/\b(road|away|visiting|visitors?)\b/.test(text)) pick = "away";
  else if (/\bhome\b/.test(text)) pick = "home";
  if (!pick) {
    pick = "favorite";
    notes.push("Demo mode couldn't tell which side to back, so it bets favorites. Edit your description or turn on AI for full understanding.");
  }

  let min = null;
  let max = null;
  let m;
  if ((m = text.match(/\bat least (?:an? )?(\d{1,2})\s*%|(\d{1,2})\s*%\s*(?:\+|or (?:more|better|higher))/))) min = Number(m[1] ?? m[2]);
  if ((m = text.match(/\b(?:at most|under|less than|below|no more than) (?:an? )?(\d{1,2})\s*%/))) max = Number(m[1]);
  if (min == null && /\b(heavy|big|huge|strong) favou?rites?\b/.test(text)) min = 70;

  const stakeMatch = text.match(/(\d{2,4})\s*coins?/);
  const venueHome = pick !== "home" && pick !== "away" && /\bhome (underdogs?|dogs?|favou?rites?|teams?)\b/.test(text);
  const NAMES = { favorite: "Chalk Eater", underdog: "Dog Pound", home: "Home Cookin'", away: "Road Warrior", ai_pick: "AI Disciple", fade_ai: "The Contrarian" };
  if (venueHome) notes.push("Home-only filters aren't supported yet, so this bot bets every matching game.");

  const first = rawText.trim().split(/(?<=[.!?])\s+/)[0];
  return {
    rules: sanitizeRules({
      name: NAMES[pick],
      summary: first.length > 200 ? `${first.slice(0, 197)}…` : first,
      sports,
      pick,
      min_prob: min,
      max_prob: max,
      stake: stakeMatch ? Number(stakeMatch[1]) : 100,
    }),
    notes,
  };
}

// ---------- Live commentary ----------

const leader = (g) => (g.home.score > g.away.score ? "home" : g.away.score > g.home.score ? "away" : null);

function scoreLine(g) {
  return `${g.away.abbr || g.away.short} ${g.away.score} – ${g.home.abbr || g.home.short} ${g.home.score}${g.clock ? ` · ${g.clock}` : ""}`;
}

function scoringCall(sport, team, pts) {
  switch (sport) {
    case "football":
      return pts >= 6 ? `🏈 TOUCHDOWN ${team}!` : pts === 3 ? `🎯 ${team} drill the field goal.` : `${team} add ${pts}.`;
    case "basketball":
      return `🔥 ${team} on a ${pts}-point burst!`;
    case "baseball":
      return `⚾ ${team} plate ${pts} run${pts === 1 ? "" : "s"}!`;
    case "hockey":
      return pts > 1 ? `🚨 ${team} strike ${pts} times!` : `🚨 GOAL ${team}!`;
    default:
      return pts > 1 ? `⚽ ${team} score ${pts}!` : `⚽ GOOOAL! ${team}!`;
  }
}

// What to say given the last commented state `prev` ({home, away, status}).
// Returns { text, kind } or null when nothing is worth saying yet.
export function commentaryFor(game, prev) {
  if (game.status === "scheduled") return null;
  if (!prev) {
    return game.status === "final"
      ? { kind: "final", text: finalCall(game) }
      : { kind: "start", text: `📺 We're live! ${game.away.name} at ${game.home.name}. ${scoreLine(game)}` };
  }
  if (game.status === "final" && prev.status !== "final") return { kind: "final", text: finalCall(game) };
  if (game.status !== "live") return null;

  const dh = game.home.score - prev.home;
  const da = game.away.score - prev.away;
  if (dh <= 0 && da <= 0) return null;
  const was = prev.home > prev.away ? "home" : prev.away > prev.home ? "away" : null;
  const now = leader(game);
  const leadChange = now && was && now !== was;
  // Basketball scores constantly, so only call runs and lead changes.
  if (game.sport === "basketball" && !leadChange && Math.max(dh, da) < 8) return null;
  const side = dh >= da ? "home" : "away";
  const call = scoringCall(game.sport, game[side].short, side === "home" ? dh : da);
  return { kind: leadChange ? "lead" : "score", text: `${leadChange ? "🔄 Lead change! " : ""}${call} ${scoreLine(game)}` };
}

function finalCall(g) {
  const w = g.winner;
  if (w === "draw") return `🏁 FINAL: honors even. ${scoreLine({ ...g, clock: "Final" })}`;
  const team = g[w];
  const margin = Math.abs(g.home.score - g.away.score);
  const flavor = margin >= (SPORTS[g.sport].unit === "points" ? 15 : 3) ? "roll" : margin <= 1 ? "survive" : "win";
  return `🏁 FINAL: the ${team.short} ${flavor}! ${scoreLine({ ...g, clock: g.clock || "Final" })}`;
}
