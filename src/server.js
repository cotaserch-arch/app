import { aiMode } from "./ai.js";
import { createApp } from "./app.js";
import { createStore } from "./store.js";

const port = Number(process.env.PORT) || 3000;
const dataFile = process.env.DATA_FILE || "data/db.json";
const store = createStore(dataFile, { seed: process.env.SEED_SAMPLES !== "false" });

createApp({ store }).listen(port, () => {
  console.log(`CotaSearch running at http://localhost:${port} (AI: ${aiMode()})`);
  if (aiMode() === "demo") {
    console.log("Demo mode: set ANTHROPIC_API_KEY to turn on real AI request writing and quote analysis.");
  }
});
