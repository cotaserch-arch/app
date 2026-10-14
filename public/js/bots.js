import { lineChart } from "./chart.js";
import { $, api, config, ensureFan, escapeHtml, rankLabel, renderShell, setBusy, signed, sparkline, toast } from "./common.js";
import { statTiles } from "./bot-stats.js";
import { describeRules } from "./rules.js";

renderShell("bots");

let current = null; // { rules, prompt }
let sports = {};

config().then((c) => {
  sports = c.sports;
  $("templates").innerHTML = c.templates.map((t) => `<button type="button" class="chip" data-text="${escapeHtml(t.text)}">${escapeHtml(t.label)}</button>`).join("");
  $("ai-note").innerHTML = c.aiMode === "live" ? '<span class="badge brand">⚡ AI on</span>' : '<span class="badge demo">🧪 Demo AI</span>';
});

$("templates").addEventListener("click", (e) => {
  const chip = e.target.closest("[data-text]");
  if (!chip) return;
  $("idea").value = chip.dataset.text;
  $("build-form").requestSubmit();
});

$("build-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("build-error").textContent = "";
  const text = $("idea").value.trim();
  const btn = $("build-btn");
  setBusy(btn, true, "Building…");
  try {
    const { rules, notes } = await api("/api/bots/compile", { method: "POST", body: { text } });
    const bt = await api("/api/bots/backtest", { method: "POST", body: { rules, days: 30 } });
    current = { rules: bt.rules, prompt: text };
    $("result").classList.remove("hidden");
    $("r-name").textContent = bt.rules.name;
    $("bot-name").value = bt.rules.name;
    $("r-roi").textContent = bt.stats.bets ? `${bt.stats.bets} bets` : "No matching games";
    $("r-notes").innerHTML = notes.map((n) => `<div class="note" style="margin-top:10px">${escapeHtml(n)}</div>`).join("");
    $("r-stats").innerHTML = statTiles(bt.stats);
    $("r-rules").innerHTML = describeRules(bt.rules, sports).map((i) => `<li>${escapeHtml(i)}</li>`).join("");
    lineChart($("r-chart"), {
      height: 240,
      baseline: 0,
      series: [{ name: "Profit (coins)", short: "Profit", points: bt.curve, color: "var(--series-1)" }],
    });
    $("result").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    $("build-error").textContent = err.message;
  } finally {
    setBusy(btn, false);
  }
});

$("enter-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!(await ensureFan())) return;
  const btn = $("enter-btn");
  setBusy(btn, true, "Entering…");
  try {
    const { id } = await api("/api/bots", { method: "POST", body: { name: $("bot-name").value.trim(), prompt: current.prompt, rules: current.rules } });
    location.href = `/bot/${encodeURIComponent(id)}?new=1`;
  } catch (err) {
    $("enter-error").textContent = err.message;
    setBusy(btn, false);
  }
});

async function loadBoard() {
  try {
    const { rows } = await api("/api/leaderboard?board=bots&limit=50");
    $("board").innerHTML = rows.length
      ? `<div class="table-wrap"><table class="board"><thead><tr><th>Rank</th><th>Bot</th><th class="r">Profit</th><th class="r hide-sm">Record</th><th class="hide-sm">Trend</th></tr></thead><tbody>${rows
          .map(
            (b) => `<tr class="link" data-href="/bot/${encodeURIComponent(b.id)}">
              <td class="rank">${rankLabel(b.rank)}</td>
              <td><a href="/bot/${encodeURIComponent(b.id)}"><b>${escapeHtml(b.name)}</b></a>${b.sample ? ' <span class="badge">Sample</span>' : ""}<div class="small muted">@${escapeHtml(b.creator)} · ${escapeHtml(b.summary)}</div></td>
              <td class="r num ${b.stats.profit >= 0 ? "up" : "down"}">${b.stats.profit >= 0 ? "▲" : "▼"} ${signed(b.stats.profit)}</td>
              <td class="r num hide-sm">${b.stats.wins}-${b.stats.losses}</td>
              <td class="hide-sm">${sparkline(b.spark)}</td>
            </tr>`,
          )
          .join("")}</tbody></table></div>`
      : '<div class="empty">No bots yet. Build the first one!</div>';
  } catch {
    $("board").innerHTML = '<div class="empty">Couldn\'t load bots.</div>';
  }
}

$("board").addEventListener("click", (e) => {
  if (e.target.closest("a")) return;
  const row = e.target.closest("tr[data-href]");
  if (row) location.href = row.dataset.href;
});

loadBoard();
if (new URLSearchParams(location.search).get("idea")) {
  $("idea").value = new URLSearchParams(location.search).get("idea");
  toast("Loaded the strategy. Tweak it or hit Build!");
}
