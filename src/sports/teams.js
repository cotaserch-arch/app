// Sports the app covers, and the fictional teams used by the demo league.

export const SPORTS = {
  football: { label: "Football", league: "NFL", espn: "football/nfl", emoji: "🏈", minutes: 190, unit: "points" },
  basketball: { label: "Basketball", league: "NBA", espn: "basketball/nba", emoji: "🏀", minutes: 150, unit: "points" },
  baseball: { label: "Baseball", league: "MLB", espn: "baseball/mlb", emoji: "⚾", minutes: 180, unit: "runs" },
  hockey: { label: "Hockey", league: "NHL", espn: "hockey/nhl", emoji: "🏒", minutes: 150, unit: "goals" },
  soccer: { label: "Soccer", league: "Premier League", espn: "soccer/eng.1", emoji: "⚽", minutes: 115, unit: "goals" },
};
export const SPORT_KEYS = Object.keys(SPORTS);

// Demo teams are fictional on purpose, so demo results can never be mistaken
// for real games.
const CITIES = ["Neon City", "Port Aurora", "Ironwood", "Silver Bay", "Ember Falls", "Northgate", "Crescent Harbor", "Red Mesa", "Glacier Point", "Summit Valley"];
const ABBR = ["NEO", "AUR", "IRW", "SLV", "EMB", "NGT", "CRH", "RMS", "GLP", "SUM"];
const MASCOTS = {
  football: ["Comets", "Mariners", "Ironclads", "Sharks", "Phoenix", "Wolves", "Pirates", "Scorpions", "Yetis", "Stallions"],
  basketball: ["Voltage", "Waves", "Forge", "Tides", "Blaze", "Hounds", "Anchors", "Dust Devils", "Avalanche", "Peaks"],
  baseball: ["Neons", "Sailors", "Miners", "Gulls", "Firebirds", "Lumberjacks", "Captains", "Rattlers", "Polar Bears", "Climbers"],
  hockey: ["Sparks", "Lights", "Steel", "Sea Lions", "Inferno", "Blizzard", "Tritons", "Vipers", "Glaciers", "Ridgebacks"],
};
const SOCCER = ["FC Neon City", "Aurora United", "Ironwood Athletic", "Silver Bay Rovers", "Ember Falls FC", "Northgate City", "Crescent Harbor SC", "Red Mesa Wanderers", "Glacier Point Albion", "Summit Valley Town"];

export function demoTeams(sport) {
  return CITIES.map((city, i) => ({
    id: `${sport}-${ABBR[i]}`,
    abbr: ABBR[i],
    name: sport === "soccer" ? SOCCER[i] : `${city} ${MASCOTS[sport][i]}`,
    short: sport === "soccer" ? SOCCER[i].replace(/^FC /, "").split(" ")[0] : MASCOTS[sport][i],
  }));
}
