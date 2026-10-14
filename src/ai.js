// Claude-powered features: game previews (the AI's pick), turning a sentence
// into a betting bot, and big-moment commentary. Each falls back to the
// offline version when no API key is set or a call fails.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { BotRulesSchema, sanitizeRules } from "./bots.js";
import { offlinePreview, parseBotOffline } from "./offline.js";
import { formatML } from "./odds.js";
import { SPORTS, SPORT_KEYS } from "./sports/teams.js";

const MODEL = process.env.CLUTCH_MODEL || "claude-opus-5-5";

const PreviewSchema = z.object({
  pick: z.enum(["home", "away"]),
  win_probability: z.number().describe("Chance the picked team wins, 50-99"),
  headline: z.string().describe("Punchy 3-7 word headline"),
  analysis: z.string().describe("2-3 sentences explaining the pick"),
  key_factor: z.string().describe("The single biggest factor, under 10 words"),
  upset_alert: z.boolean().describe("True if the underdog has a real shot"),
});

const CommentarySchema = z.object({ line: z.string().describe("One energetic sentence, under 25 words") });

const PREVIEW_SYSTEM = `You are "the Bot", Clutch's AI sports analyst. Fans try to beat your picks, so make a clear call on who wins and explain it like a sharp, fun TV analyst.

Base your pick on the data provided: records, home/away and betting lines. Don't state injuries, trades or news as fact, because your knowledge may be out of date; general team context is fine if you hedge it. Moneylines are American odds. Never encourage anyone to gamble.`;

const BOT_SYSTEM = `You turn a fan's betting idea into a Clutch betting bot. Bots bet free play coins on finished games using the closing line.

Fields:
- sports: any of ${SPORT_KEYS.join(", ")}. If none mentioned, use all.
- pick: favorite | underdog | home | away | ai_pick (back the AI analyst's pick) | fade_ai (bet against the AI's pick).
- min_prob / max_prob: limits on the chosen side's implied win chance, in percent (e.g. "big favorites" ≈ min 70; "live underdogs" ≈ min 35). null if not mentioned.
- stake: coins per bet, default 100.
Capture what the fan said without adding rules they didn't ask for. Give the bot a catchy 1-3 word name.`;

let client = null;

export function aiMode() {
  return process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? "live" : "demo";
}

function getClient() {
  if (!client) client = new Anthropic({ timeout: 60_000, maxRetries: 1 });
  return client;
}

async function structuredCall({ system, prompt, schema, effort }) {
  const response = await getClient().beta.messages.parse({
    model: MODEL,
    max_tokens: 8000,
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

const describeTeam = (t) => `${t.name}${t.record ? ` (${t.record})` : ""}`;

export async function previewGame(game) {
  if (aiMode() === "demo") return offlinePreview(game);
  const o = game.odds;
  const lines = o
    ? `Moneyline: ${game.home.short} ${formatML(o.homeML)}, ${game.away.short} ${formatML(o.awayML)}${o.drawML ? `, draw ${formatML(o.drawML)}` : ""}. Total: ${o.total ?? "n/a"}.`
    : "No betting line available.";
  const prompt = `<game>\n${SPORTS[game.sport].label} · ${game.league}${game.source === "demo" ? " (a fictional demo league; use only the data here)" : ""}\nAway: ${describeTeam(game.away)}\nHome: ${describeTeam(game.home)}\nStarts: ${game.startsAt}\n${lines}\n</game>`;
  try {
    const p = await structuredCall({ system: PREVIEW_SYSTEM, prompt, schema: PreviewSchema, effort: "low" });
    return { ...p, win_probability: Math.round(Math.min(99, Math.max(50, p.win_probability))), source: "ai" };
  } catch (error) {
    logFallback("previewGame", error);
    return offlinePreview(game);
  }
}

export async function compileBot(text) {
  if (aiMode() === "demo") return { ...parseBotOffline(text), source: "demo" };
  try {
    const raw = await structuredCall({ system: BOT_SYSTEM, prompt: `<idea>\n${text}\n</idea>`, schema: BotRulesSchema, effort: "low" });
    return { rules: sanitizeRules(raw), notes: [], source: "ai" };
  } catch (error) {
    logFallback("compileBot", error);
    return { ...parseBotOffline(text), source: "demo" };
  }
}

// Upgrades a template call into a livelier line for big moments.
export async function commentate(game, moment) {
  if (aiMode() === "demo") return null;
  const prompt = `<moment kind="${moment.kind}">\n${moment.text}\n</moment>\nGame: ${game.away.name} at ${game.home.name} (${SPORTS[game.sport].label}). Score: ${game.away.short} ${game.away.score}, ${game.home.short} ${game.home.score}. ${game.clock ?? ""}`;
  try {
    const { line } = await structuredCall({
      system: "You are an energetic live sports commentator for a fan watch party. Write one line about this moment. Use only the facts given.",
      prompt,
      schema: CommentarySchema,
      effort: "low",
    });
    return line.slice(0, 280);
  } catch (error) {
    logFallback("commentate", error);
    return null;
  }
}
