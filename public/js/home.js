import { lineChart } from "./chart.js";
import {
  $, api, boardTable, coachHtml, config, escapeHtml, pct, rememberBot, renderShell, rulesHtml,
  saveTraderName, setBusy, statTiles, traderName, wireBoard,
} from "./common.js";

renderShell("build");

let current = null; // { strategy, prompt, clonedFrom }

config().then((c) => {
  $("templates").innerHTML = c.templates
    .map((t) => `<button type="button" class="chip" data-text="${escapeHtml(t.text)}">${escapeHtml(t.label)}</button>`)
    .join("");
  $("mode-line").innerHTML = [
    c.aiMode === "live" ? '<span class="badge live">⚡ AI on</span>' : '<span class="badge sim">🧪 Demo AI</span>',
    c.market.source === "live" ? '<span class="badge live">● Live prices</span>' : '<span class="badge sim">Simulated market</span>',
  ].join("");
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
  if (text.length < 8) {
    $("build-error").textContent = "Describe your strategy in a sentence or two.";
    return;
  }
  const btn = $("build-btn");
  setBusy(btn, true, "AI is building your bot…");
  try {
    const { strategy, notes } = await api("/api/strategies/compile", { method: "POST", body: { text } });
    current = { strategy, prompt: text, clonedFrom: null };
    await showResult(strategy, notes);
  } catch (err) {
    $("build-error").textContent = err.message;
  } finally {
    setBusy(btn, false);
  }
});

async function showResult(strategy, notes = []) {
  const { strategy: clean, rules, result } = await api("/api/strategies/backtest", { method: "POST", body: { strategy } });
  current.strategy = clean;
  $("result").classList.remove("hidden");
  $("r-name").textContent = clean.name;
  $("r-summary").textContent = clean.summary;
  $("r-window").textContent = "Backtest: last 12 months";
  $("r-notes").innerHTML = notes.map((n) => `<div class="note">${escapeHtml(n)}</div>`).join("");
  $("r-stats").innerHTML = statTiles(result.stats);
  $("r-rules").innerHTML = `<h3 style="margin-bottom:10px">The rules</h3>${rulesHtml(rules)}`;
  $("bot-name").value = clean.name;
  $("trader").value = traderName();
  lineChart($("r-chart"), {
    baseline: result.stats.startingCash,
    series: [
      { name: clean.name, short: "Bot", points: result.curve, color: "var(--series-1)" },
      { name: "Just holding Bitcoin", short: "BTC", points: result.benchmark, color: "var(--series-2)", dash: true },
    ],
  });
  $("result").scrollIntoView({ behavior: "smooth", block: "start" });

  $("r-coach").innerHTML = '<div class="row" style="justify-content:flex-start"><span class="spinner"></span> The AI coach is reviewing your bot…</div>';
  api("/api/strategies/coach", { method: "POST", body: { strategy: clean } })
    .then(({ coach }) => ($("r-coach").innerHTML = coachHtml(coach)))
    .catch((err) => ($("r-coach").innerHTML = `<div class="muted">Coach unavailable: ${escapeHtml(err.message)}</div>`));
}

$("tweak-btn").addEventListener("click", () => {
  $("build-form").scrollIntoView({ behavior: "smooth" });
  $("idea").focus();
});

$("enter-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("enter-error").textContent = "";
  const btn = $("enter-btn");
  setBusy(btn, true, "Entering…");
  try {
    const creator = $("trader").value.trim();
    const { id } = await api("/api/bots", {
      method: "POST",
      body: { name: $("bot-name").value.trim(), creator, prompt: current.prompt, strategy: current.strategy, clonedFrom: current.clonedFrom },
    });
    saveTraderName(creator);
    rememberBot(id);
    location.href = `/bot/${encodeURIComponent(id)}?new=1`;
  } catch (err) {
    $("enter-error").textContent = err.message;
    setBusy(btn, false);
  }
});

// Cloning: /?clone=<botId> loads that bot's exact rules into the builder.
const cloneId = new URLSearchParams(location.search).get("clone");
if (cloneId) {
  api(`/api/bots/${encodeURIComponent(cloneId)}`)
    .then(async ({ bot }) => {
      $("idea").value = bot.prompt || "";
      current = { strategy: { ...bot.strategy, name: `${bot.name} 2.0` }, prompt: bot.prompt, clonedFrom: bot.id };
      await showResult(current.strategy, [`🧬 Cloned from ${bot.name} by @${bot.creator}. Rename it and enter it as your own.`]);
    })
    .catch(() => {});
}

async function loadLeague() {
  try {
    const { bots, highlights } = await api("/api/leaderboard?limit=8");
    const board = $("board");
    board.innerHTML = bots.length ? boardTable(bots, { compact: true }) : '<div class="empty">No bots yet. Be the first!</div>';
    wireBoard(board);
    if (highlights) {
      const card = (icon, label, b, value) => `
        <a class="card highlight" href="/bot/${encodeURIComponent(b.id)}">
          <span class="icon">${icon}</span>
          <span><span class="k">${label}</span><br><strong>${escapeHtml(b.name)}</strong> <span class="muted small">@${escapeHtml(b.creator)}</span><br>${value}</span>
        </a>`;
      $("highlights").innerHTML =
        card("👑", "League leader", highlights.leader, pct(highlights.leader.returnPct)) +
        card("🚀", "Top mover today", highlights.mover, pct(highlights.mover.dayChangePct)) +
        card("🔥", "Crowd favorite", highlights.favorite, `<span class="num">🔥 ${highlights.favorite.hype} hype</span>`);
    }
  } catch {
    $("board").innerHTML = '<div class="empty">Couldn\'t load the league right now.</div>';
  }
}
loadLeague();
