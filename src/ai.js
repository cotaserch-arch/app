// Claude-powered features: compiling a plain-English strategy into a bot, and
// coaching a bot on its backtest. Falls back to the offline versions when no
// API key is set or a call fails.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { describeStrategy } from "../public/js/describe.js";
import { coachOffline, parseStrategyOffline } from "./offline.js";
import { ASSETS, ASSET_NAMES, StrategySchema, sanitizeStrategy } from "./strategy.js";

const MODEL = process.env.BOTFOLIO_MODEL || "claude-opus-5-5";

const CoachSchema = z.object({
  grade: z.enum(["A", "B", "C", "D", "F"]),
  verdict: z.string().describe("One punchy sentence"),
  strengths: z.array(z.string()).describe("Up to 3"),
  weaknesses: z.array(z.string()).describe("Up to 3"),
  suggestion: z.string().describe("The single most useful change to try next"),
});

const COMPILE_SYSTEM = `You compile plain-English crypto trading ideas into Botfolio strategies. Botfolio is a paper-trading game: bots trade simulated money on daily closing prices.

Coins available: ${ASSETS.map((a) => `${a} (${ASSET_NAMES[a]})`).join(", ")}.

Each condition compares one indicator for the coin being considered against a threshold. All values are percentages unless noted:
- change_pct: % price change over the last \`period\` days. "Drops 10% in a week" = change_pct, period 7, below, -10.
- price_vs_sma: % distance of price from its \`period\`-day moving average. "Above the 50-day average" = period 50, above, 0.
- sma_cross: % gap between the \`period\`-day average and the slower \`period2\`-day average. "Golden cross" = period 50, period2 200, above, 0.
- rsi: RSI over \`period\` days (use 14 unless stated), value 0-100.
- drawdown_from_high: how far (positive %) price sits below its \`period\`-day high.
- volatility: standard deviation of daily % moves over \`period\` days.
period2 is null for everything except sma_cross.

Entry conditions must ALL hold to buy; exit conditions trigger a sell if ANY holds. Use stop_loss_pct / take_profit_pct for "sell if it loses X%" / "sell when it's up X%" relative to the buy price. "Top N performers" means rank_by_momentum. "Buy and hold" means no entry and no exit conditions.

Capture what the user asked for without adding rules they didn't ask for. When something is unspecified: no coin mentioned means BTC; "all coins" means every coin; size positions so max_positions × position_size_pct is about 100. Give the bot a catchy 1-3 word name.`;

const COACH_SYSTEM = `You are Botfolio's AI coach. You review a paper-trading bot's one-year backtest on simulated money and give an honest, specific, encouraging critique, like a sharp trading mentor. Ground every point in the numbers given. Remember that a backtest can be luck or overfitting, and never suggest trading real money or promise future returns. Keep each point to one short sentence.`;

let client = null;

export function aiMode() {
  return process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? "live" : "demo";
}

function getClient() {
  if (!client) client = new Anthropic({ timeout: 90_000, maxRetries: 1 });
  return client;
}

async function structuredCall({ system, prompt, schema, effort }) {
  const response = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort, format: betaZodOutputFormat(schema) },
    system,
    messages: [{ role: "user", content: prompt }],
  });
  if (response.stop_reason === "refusal") {
    throw new Error(`Model declined the request (${response.stop_details?.category ?? "unspecified"})`);
  }
  if (response.stop_reason === "max_tokens" || !response.parsed_output) {
    throw new Error(`No structured output (stop_reason: ${response.stop_reason})`);
  }
  return response.parsed_output;
}

function logFallback(feature, error) {
  const detail = error instanceof Anthropic.APIError ? `API error ${error.status}: ${error.message}` : error.message;
  console.error(`[ai] ${feature} failed (${detail}). Using offline fallback.`);
}

export async function compileStrategy(text) {
  if (aiMode() === "demo") return { ...parseStrategyOffline(text), source: "demo" };
  try {
    const raw = await structuredCall({
      system: COMPILE_SYSTEM,
      prompt: `<strategy_idea>\n${text}\n</strategy_idea>`,
      schema: StrategySchema,
      effort: "medium",
    });
    return { strategy: sanitizeStrategy(raw), notes: [], source: "ai" };
  } catch (error) {
    logFallback("compileStrategy", error);
    return { ...parseStrategyOffline(text), source: "demo" };
  }
}

export async function coachStrategy(strategy, result) {
  if (aiMode() === "demo") return { ...coachOffline(strategy, result), source: "demo" };
  const rules = describeStrategy(strategy)
    .map((s) => `${s.title}:\n${s.items.map((i) => `- ${i}`).join("\n")}`)
    .join("\n");
  const prompt = `<bot name="${strategy.name.replace(/["<>]/g, "")}">\n${rules}\n</bot>\n<backtest>\n${JSON.stringify(
    { ...result.stats, period: `${result.startDate} to ${result.endDate}`, recentTrades: result.trades.slice(-12) },
    null,
    2,
  )}\n</backtest>`;
  try {
    const coach = await structuredCall({ system: COACH_SYSTEM, prompt, schema: CoachSchema, effort: "low" });
    return {
      ...coach,
      strengths: coach.strengths.slice(0, 3),
      weaknesses: coach.weaknesses.slice(0, 3),
      source: "ai",
    };
  } catch (error) {
    logFallback("coachStrategy", error);
    return { ...coachOffline(strategy, result), source: "demo" };
  }
}
