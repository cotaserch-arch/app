// Sample fans and bots so a fresh install has a living leaderboard. Every one
// is flagged `sample: true` and labeled "Sample" in the app.
import { rng } from "./sports/demo.js";
import { winProbs } from "./offline.js";
import { SPORT_KEYS } from "./sports/teams.js";

const FANS = [
  { handle: "chalk_charlie", style: "favorite", rate: 0.5 },
  { handle: "dogwalker", style: "underdog", rate: 0.35 },
  { handle: "homer_simpsonn", style: "home", rate: 0.45 },
  { handle: "stat_queen", style: "smart", rate: 0.6 },
  { handle: "vibes_only", style: "random", rate: 0.4 },
  { handle: "ai_truther", style: "bot", rate: 0.55 },
];

const BOTS = [
  { fan: 0, name: "Chalk Eater", prompt: "Only bet favorites with at least a 60% chance to win.", rules: { sports: SPORT_KEYS, pick: "favorite", min_prob: 60, max_prob: null, stake: 100 } },
  { fan: 1, name: "Dog Pound", prompt: "Bet every underdog with at least a 35% chance, 100 coins a game.", rules: { sports: SPORT_KEYS, pick: "underdog", min_prob: 35, max_prob: null, stake: 100 } },
  { fan: 2, name: "Home Cookin'", prompt: "Always bet the home team in basketball and hockey.", rules: { sports: ["basketball", "hockey"], pick: "home", min_prob: null, max_prob: null, stake: 100 } },
  { fan: 5, name: "AI Disciple", prompt: "Back whatever the AI picks in every sport.", rules: { sports: SPORT_KEYS, pick: "ai_pick", min_prob: null, max_prob: null, stake: 100 } },
  { fan: 4, name: "The Contrarian", prompt: "Bet against the AI's pick every single game.", rules: { sports: SPORT_KEYS, pick: "fade_ai", min_prob: null, max_prob: null, stake: 100 } },
];

export function seedSamples(league, { store, sports, now = Date.now() }) {
  const since = new Date(now - 21 * 86_400_000).toISOString();
  const finals = sports.games().filter((g) => g.status === "final" && g.startsAt >= since);
  const fans = FANS.map((f) => league.createFan({ handle: f.handle, sample: true }));

  FANS.forEach((f, i) => {
    const fan = fans[i];
    const rand = rng(1000 + i);
    for (const g of finals) {
      if (rand() > f.rate) continue;
      const p = winProbs(g);
      const fav = p.home >= p.away ? "home" : "away";
      const dog = fav === "home" ? "away" : "home";
      const side = {
        favorite: fav,
        underdog: dog,
        home: "home",
        smart: rand() < 0.8 ? fav : dog,
        random: rand() < 0.5 ? "home" : "away",
        bot: league.botPick(g),
      }[f.style];
      store.db.picks[`${fan.id}:${g.id}`] = { fanId: fan.id, gameId: g.id, side, at: new Date(Date.parse(g.startsAt) - 3_600_000).toISOString(), result: null };
    }
  });

  for (const b of BOTS) {
    league.createBot(fans[b.fan], {
      name: b.name,
      prompt: b.prompt,
      rules: { ...b.rules, name: b.name, summary: b.prompt },
      sample: true,
      createdAt: since,
    });
  }
  league.gradePicks();
  store.save();
}
