import * as ai from "./ai.js";
import { createApp } from "./app.js";
import { createLeague } from "./league.js";
import { seedSamples } from "./seed.js";
import { createSportsProvider } from "./sports/provider.js";
import { createPusher } from "./push.js";
import { createStore } from "./store.js";

const port = Number(process.env.PORT) || 3000;
const store = createStore(process.env.DATA_FILE || "data/db.json");
const sports = createSportsProvider();
await sports.start();
const league = createLeague({ store, sports, ai, pusher: createPusher() });
// Grade picks (and send result notifications) even when nobody is browsing.
setInterval(() => league.gradePicks(), 60_000).unref();
if (store.fresh && process.env.SEED_SAMPLES !== "false") seedSamples(league, { store, sports });

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    store.flush();
    process.exit(0);
  });
}

createApp({ league, sports, store }).listen(port, () => {
  console.log(`Clutch running at http://localhost:${port} (AI: ${ai.aiMode()}, games: ${sports.source})`);
  if (ai.aiMode() === "demo") console.log("Demo mode: set ANTHROPIC_API_KEY to turn on the AI analyst, bot builder and commentary.");
});
