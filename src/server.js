import { aiMode } from "./ai.js";
import { createApp } from "./app.js";
import { createMarketProvider } from "./market.js";
import { sampleBots } from "./seed.js";
import { createStore } from "./store.js";

const port = Number(process.env.PORT) || 3000;
const store = createStore(process.env.DATA_FILE || "data/db.json", {
  seed: process.env.SEED_SAMPLES === "false" ? null : sampleBots,
});
const market = createMarketProvider();
await market.start();

createApp({ store, market }).listen(port, () => {
  console.log(`Botfolio running at http://localhost:${port} (AI: ${aiMode()}, prices: ${market.get().source})`);
  if (aiMode() === "demo") console.log("Demo mode: set ANTHROPIC_API_KEY to turn on the AI strategy builder and coach.");
});
