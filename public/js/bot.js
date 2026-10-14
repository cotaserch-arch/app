import { lineChart } from "./chart.js";
import {
  $, api, coachHtml, escapeHtml, hype, hypedToday, myBots, pct, rankLabel, renderShell, rulesHtml, setBusy,
  share, statTiles, usd,
} from "./common.js";

renderShell("league");

const id = decodeURIComponent(location.pathname.split("/")[2] || "");
let data = null;

async function load() {
  try {
    data = await api(`/api/bots/${encodeURIComponent(id)}`);
  } catch {
    $("loading").classList.add("hidden");
    $("missing").classList.remove("hidden");
    return;
  }
  render();
  $("loading").classList.add("hidden");
  $("page").classList.remove("hidden");
}

function render() {
  const { bot, rules, live, backtest } = data;
  document.title = `${bot.name} by @${bot.creator} · Botfolio`;

  if (new URLSearchParams(location.search).get("new") === "1") {
    $("banner").innerHTML = `<div class="banner">🏁 <b>${escapeHtml(bot.name)} is in the league!</b> It trades live from today's prices. Share it, then check back to see how it ranks.</div>`;
  } else if (myBots().includes(bot.id)) {
    $("banner").innerHTML = `<div class="banner">🤖 This is your bot.</div>`;
  }

  $("tags").innerHTML = [
    `<span class="badge brand">${bot.rank <= 3 ? `${rankLabel(bot.rank)} ` : ""}Rank #${bot.rank} of ${data.total}</span>`,
    bot.sample ? '<span class="badge">Sample</span>' : "",
    data.market.source === "live" ? "" : '<span class="badge sim">Simulated market</span>',
  ].join("");
  $("name").textContent = bot.name;
  $("byline").innerHTML = `by <b>@${escapeHtml(bot.creator)}</b> · in the league ${bot.daysLive} day${bot.daysLive === 1 ? "" : "s"} · 🧬 ${bot.clones} clone${bot.clones === 1 ? "" : "s"}`;
  $("ret").innerHTML = pct(live.stats.returnPct);
  $("equity").textContent = `${usd(live.stats.finalEquity)} from ${usd(live.stats.startingCash)}`;

  const hypeBtn = $("hype-btn");
  hypeBtn.innerHTML = `🔥 ${bot.hype}`;
  hypeBtn.classList.toggle("ghost", hypedToday(bot.id));
  $("clone-btn").href = `/?clone=${encodeURIComponent(bot.id)}`;
  $("battle-btn").href = `/battle?a=${encodeURIComponent(bot.id)}`;

  $("badges").innerHTML = bot.badges.length
    ? bot.badges.map((b) => `<span class="achievement" title="${escapeHtml(b.why)}">${b.icon} ${escapeHtml(b.name)}</span>`).join("")
    : '<span class="muted small">No badges yet. They\'re earned in the league.</span>';

  $("live-window").textContent = `Since ${live.startDate}`;
  $("live-stats").innerHTML = statTiles(live.stats);
  lineChart($("live-chart"), {
    baseline: live.stats.startingCash,
    series: [
      { name: bot.name, short: "Bot", points: live.curve, color: "var(--series-1)" },
      { name: "Just holding Bitcoin", short: "BTC", points: live.benchmark, color: "var(--series-2)", dash: true },
    ],
  });

  $("bt-stats").innerHTML = statTiles(backtest.stats);
  lineChart($("bt-chart"), {
    height: 220,
    baseline: backtest.stats.startingCash,
    series: [
      { name: bot.name, short: "Bot", points: backtest.curve, color: "var(--series-1)" },
      { name: "Just holding Bitcoin", short: "BTC", points: backtest.benchmark, color: "var(--series-2)", dash: true },
    ],
  });

  $("rules").innerHTML = `<h3 style="margin-bottom:10px">The rules 🔒</h3>${rulesHtml(rules)}`;
  if (bot.prompt) $("prompt").textContent = `“${bot.prompt}”`;
  else $("prompt-card").classList.add("hidden");

  $("holdings").innerHTML = live.openPositions.length
    ? `<table class="board">${live.openPositions
        .map((p) => `<tr><td><b>${escapeHtml(p.asset)}</b><div class="creator">since ${escapeHtml(p.entryDate)}</div></td><td class="r">${pct(p.pnlPct)}</td></tr>`)
        .join("")}</table>`
    : '<div class="muted">All cash, waiting for a signal.</div>';

  $("trades").innerHTML = live.trades.length
    ? `<thead><tr><th>Date</th><th>Action</th><th class="r">Price</th><th class="r">Result</th></tr></thead><tbody>${live.trades
        .map(
          (t) => `<tr style="cursor:default"><td class="small num">${escapeHtml(t.date)}</td>
            <td>${t.side === "buy" ? "🟢 Bought" : "🔴 Sold"} <b>${escapeHtml(t.asset)}</b>${t.reason ? ` <span class="muted small">(${escapeHtml(t.reason)})</span>` : ""}</td>
            <td class="r num small">${usd(t.price)}</td>
            <td class="r">${t.side === "sell" ? pct(t.pnlPct) : `<span class="muted small num">${usd(t.amount)}</span>`}</td></tr>`,
        )
        .join("")}</tbody>`
    : '<tbody><tr><td class="muted">No trades yet. The bot is waiting for its buy signal.</td></tr></tbody>';
}

$("hype-btn").addEventListener("click", async () => {
  if (hypedToday(id)) return;
  await hype(id, $("hype-btn"));
  $("hype-btn").classList.add("ghost");
});

$("share-btn").addEventListener("click", async () => {
  const { bot, live } = data;
  const sign = live.stats.returnPct >= 0 ? "+" : "";
  const result = await share({
    title: `${bot.name} on Botfolio`,
    text: `My AI trading bot ${bot.name} is ${sign}${live.stats.returnPct}% and ranked #${bot.rank} on Botfolio. Can yours beat it? 🤖⚔️`,
    url: `${location.origin}/bot/${encodeURIComponent(bot.id)}`,
  });
  if (result === "copied") {
    $("share-btn").textContent = "✅ Link copied";
    setTimeout(() => ($("share-btn").textContent = "🔗 Share"), 1800);
  }
});

$("coach-btn").addEventListener("click", async () => {
  const btn = $("coach-btn");
  setBusy(btn, true, "Reviewing…");
  try {
    const { coach } = await api("/api/strategies/coach", { method: "POST", body: { strategy: data.bot.strategy } });
    $("coach").innerHTML = coachHtml(coach);
  } catch (err) {
    setBusy(btn, false);
    btn.insertAdjacentHTML("afterend", `<div class="error">${escapeHtml(err.message)}</div>`);
  }
});

load();
