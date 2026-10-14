// Picks the game source at startup: real ESPN games when reachable, otherwise
// the demo league. The choice holds for the whole run so picks and markets
// never point at games from the other source.
import { buildDemoSchedule } from "./demo.js";
import { fetchEspnDays } from "./espn.js";

const RECENT = [-1, 0, 1, 2];
const HISTORY = Array.from({ length: 19 }, (_, i) => -(i + 2));

export function createSportsProvider({ mode = process.env.SPORTS_DATA || "auto", fetchImpl = fetch, log = console } = {}) {
  let source = "demo";
  let games = new Map();
  let demoAt = 0;
  let timers = [];
  let version = 0;

  function setGames(list) {
    for (const g of list) games.set(g.id, g);
    version++;
  }

  function demoSnapshot() {
    // The demo league moves with the clock, so rebuild it every few seconds.
    if (Date.now() - demoAt > 5_000) {
      games = new Map(buildDemoSchedule().map((g) => [g.id, g]));
      demoAt = Date.now();
      version++;
    }
  }

  async function refreshEspn(dayOffsets) {
    try {
      setGames(await fetchEspnDays({ dayOffsets, fetchImpl }));
      return true;
    } catch (error) {
      log.error?.(`[sports] ESPN refresh failed (${error.message}). Keeping the last good data.`);
      return false;
    }
  }

  return {
    get source() {
      return source;
    },
    get version() {
      if (source === "demo") demoSnapshot();
      return `${source}:${version}`;
    },
    async start() {
      if (mode !== "demo") {
        if (await refreshEspn(RECENT)) {
          source = "espn";
          log.log?.(`[sports] Live ESPN data: ${games.size} games`);
          refreshEspn(HISTORY);
          timers.push(setInterval(() => refreshEspn(RECENT), 90_000));
          timers.push(setInterval(() => refreshEspn(HISTORY), 6 * 3_600_000));
          timers.forEach((t) => t.unref?.());
          return;
        }
        if (mode === "espn") throw new Error("ESPN data unavailable and SPORTS_DATA=espn");
      }
      source = "demo";
      demoSnapshot();
      log.log?.("[sports] Using the demo league (fictional teams).");
    },
    stop() {
      timers.forEach(clearInterval);
    },
    games() {
      if (source === "demo") demoSnapshot();
      return [...games.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    },
    game(id) {
      if (source === "demo") demoSnapshot();
      return games.get(id) || null;
    },
  };
}
