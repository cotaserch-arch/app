import {
  $, api, config, ensureFan, escapeHtml, localDate, me, ml, rankLabel, refreshCoins, renderShell, share, statusLabel,
  teamLogo, toast,
} from "./common.js";
import { createGroupFrom } from "./groups.js";

renderShell("today");

$("group-form").addEventListener("submit", (e) => {
  e.preventDefault();
  createGroupFrom($("group-name"));
});

let day = 0;
let sport = "";
let games = [];
let partner = null;

config().then((c) => {
  partner = c.partner;
  $("sports").innerHTML =
    `<button class="chip active" data-sport="">All sports</button>` +
    Object.entries(c.sports)
      .map(([key, s]) => `<button class="chip" data-sport="${key}">${s.emoji} ${escapeHtml(c.source === "demo" ? s.label : s.league)}</button>`)
      .join("");
});

$("sports").addEventListener("click", (e) => {
  const chip = e.target.closest("[data-sport]");
  if (!chip) return;
  sport = chip.dataset.sport;
  document.querySelectorAll("#sports .chip").forEach((c) => c.classList.toggle("active", c === chip));
  load();
});

$("days").addEventListener("click", (e) => {
  const tab = e.target.closest("[data-day]");
  if (!tab) return;
  day = Number(tab.dataset.day);
  document.querySelectorAll("#days .tab").forEach((t) => t.classList.toggle("active", t === tab));
  load();
});

function card(g) {
  const pickBtn = (side) => {
    const t = g[side];
    const mine = g.myPick === side;
    const result = g.status === "final" && mine ? (g.winner === side ? "won" : "lost") : "";
    return `<button class="pick-btn ${mine ? "mine" : ""} ${result}" data-pick="${side}" data-game="${escapeHtml(g.id)}" ${g.status !== "scheduled" ? "disabled" : ""}>
      ${mine ? (result === "won" ? "✅ " : result === "lost" ? "❌ " : "✓ ") : ""}${escapeHtml(t.short || t.name)} <span class="muted num">${ml(g.odds?.[`${side}ML`])}</span>
    </button>`;
  };
  const teamRow = (side) => {
    const t = g[side];
    const loser = g.status === "final" && g.winner && g.winner !== side && g.winner !== "draw";
    return `<div class="team-row ${loser ? "loser" : ""}">
      <div class="team">${teamLogo(t)}<div style="min-width:0"><div class="team-name">${escapeHtml(t.name)}</div><div class="team-rec">${escapeHtml(t.record || "")}${side === "home" ? " · home" : ""}</div></div></div>
      <div class="team-score">${t.score ?? ""}</div>
    </div>`;
  };
  const botTeam = g[g.bot.pick];
  const botResult = g.status === "final" ? (g.winner === g.bot.pick ? " ✅" : " ❌") : "";
  const homePrice = g.homeWinPrice != null ? Math.round(g.homeWinPrice * 100) : null;
  return `
    <article class="card game ${g.status === "live" ? "is-live" : ""}">
      <div class="game-top"><span>${escapeHtml(g.league)}</span>${statusLabel(g)}</div>
      ${teamRow("away")}${teamRow("home")}
      <div class="botline">
        <span>🤖 Bot picks <b>${escapeHtml(botTeam.short || botTeam.name)}</b> <span class="num">${g.bot.win_probability}%</span>${botResult}</span>
        ${g.bot.upset_alert && g.status === "scheduled" ? '<span class="badge upset">⚠️ Upset alert</span>' : ""}
      </div>
      <div class="pick-row">${pickBtn("away")}${pickBtn("home")}</div>
      <div class="game-links">
        <a href="/game/${encodeURIComponent(g.id)}">${g.status === "live" ? "🔴 Watch party" : g.status === "final" ? "Recap & chat" : "📈 Markets & AI preview"} →</a>
        ${homePrice != null && g.status === "scheduled" ? `<span class="small muted">Fans: ${escapeHtml(g.home.short)} ${homePrice}%</span>` : ""}
      </div>
      ${partner && g.status === "scheduled" ? `<a class="partner-link" href="${escapeHtml(partner.url)}" target="_blank" rel="sponsored noopener">Bet it at ${escapeHtml(partner.name)} ↗ · ${escapeHtml(partner.terms)}</a>` : ""}
    </article>`;
}

async function load() {
  const box = $("games");
  try {
    const params = new URLSearchParams({ date: localDate(day), tz: String(new Date().getTimezoneOffset()) });
    if (sport) params.set("sport", sport);
    const data = await api(`/api/games?${params}`);
    games = data.games;
    const order = { live: 0, scheduled: 1, final: 2 };
    games.sort((a, b) => order[a.status] - order[b.status] || a.startsAt.localeCompare(b.startsAt));
    box.innerHTML = games.length ? games.map(card).join("") : '<div class="card empty" style="grid-column:1/-1">No games on this day. Try another day or sport.</div>';
    const r = data.botRecord;
    $("bot-record").textContent = `🤖 The Bot is ${r.won}-${r.lost} over the last ${r.days} days`;
  } catch {
    box.innerHTML = '<div class="card empty" style="grid-column:1/-1">Couldn\'t load games right now.</div>';
  }
}

$("games").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-pick]");
  if (!btn || btn.disabled) return;
  if (!(await ensureFan())) return;
  try {
    await api(`/api/games/${encodeURIComponent(btn.dataset.game)}/pick`, { method: "POST", body: { side: btn.dataset.pick } });
    const g = games.find((x) => x.id === btn.dataset.game);
    g.myPick = btn.dataset.pick;
    btn.closest(".game").outerHTML = card(g);
    const agree = g.bot.pick === g.myPick;
    toast(agree ? "Locked in. You agree with the Bot 🤝" : "Locked in. You're fading the Bot 😤");
    loadVs();
  } catch (err) {
    toast(err.message);
  }
});

async function loadVs() {
  const data = await me({ refresh: true });
  if (!data) {
    $("vs-note").textContent = "Join to start your record";
    return;
  }
  const graded = data.picks.filter((p) => p.result);
  $("you-score").textContent = graded.filter((p) => p.result === "won").length;
  $("bot-score").textContent = graded.filter((p) => p.botWon).length;
  const pending = data.picks.length - graded.length;
  $("vs-note").textContent = `Last 3 days · ${pending} pick${pending === 1 ? "" : "s"} pending`;
  $("daily-btn").disabled = !data.profile.canClaimDaily;
  if (!data.profile.canClaimDaily) $("daily-btn").textContent = "✅ Daily coins claimed";
}

$("daily-btn").addEventListener("click", async () => {
  if (!(await ensureFan())) return;
  try {
    const r = await api("/api/me/daily", { method: "POST", body: {} });
    toast(`🎁 +${r.bonus} coins! Day ${r.streak} streak`);
    refreshCoins();
    loadVs();
  } catch (err) {
    toast(err.message);
  }
});

$("invite-btn").addEventListener("click", async () => {
  if (!(await ensureFan())) return;
  const data = await me();
  await share({
    title: "Clutch",
    text: "Think you can beat the AI at sports? Join me on Clutch and we both get 500 coins.",
    url: `${location.origin}/?ref=${encodeURIComponent(data.profile.id)}`,
  });
});

async function loadBoard() {
  try {
    const { rows } = await api("/api/leaderboard?board=pickers&limit=6");
    $("mini-board").innerHTML = rows.length
      ? `<table class="board"><tbody>${rows
          .map((r) => `<tr><td class="rank">${rankLabel(r.rank)}</td><td><b>${escapeHtml(r.handle)}</b>${r.sample ? ' <span class="badge">Sample</span>' : ""}<div class="small muted">${r.stats.accuracy ?? 0}% · 🔥${r.stats.streak}</div></td><td class="r num">${r.stats.points}</td></tr>`)
          .join("")}</tbody></table>`
      : '<div class="muted small">No picks graded yet.</div>';
  } catch {
    $("mini-board").innerHTML = "";
  }
}

load();
loadVs();
loadBoard();
setInterval(() => {
  if (!document.hidden && games.some((g) => g.status === "live")) load();
}, 30_000);
