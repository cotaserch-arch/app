import { lineChart } from "./chart.js";
import { $, api, escapeHtml, pct, renderShell, rulesHtml, setBusy, share, statTiles } from "./common.js";

renderShell("battle");

const params = new URLSearchParams(location.search);
let days = [30, 90, 365].includes(Number(params.get("days"))) ? Number(params.get("days")) : 90;

function selectTab() {
  document.querySelectorAll("#days .tab").forEach((t) => t.classList.toggle("active", Number(t.dataset.days) === days));
}
selectTab();

$("days").addEventListener("click", (e) => {
  const tab = e.target.closest("[data-days]");
  if (!tab) return;
  days = Number(tab.dataset.days);
  selectTab();
});

async function init() {
  const { bots } = await api("/api/leaderboard?limit=200");
  const options = bots
    .map((b) => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)} · @${escapeHtml(b.creator)}</option>`)
    .join("");
  $("a").innerHTML = options;
  $("b").innerHTML = options;
  const a = params.get("a") || bots[0]?.id;
  const b = params.get("b") || bots.find((x) => x.id !== a)?.id;
  if (a) $("a").value = a;
  if (b) $("b").value = b;
  if (params.get("a") && params.get("b")) fight();
}

async function fight() {
  $("err").textContent = "";
  const a = $("a").value;
  const b = $("b").value;
  if (!a || !b || a === b) {
    $("err").textContent = "Pick two different bots.";
    return;
  }
  history.replaceState(null, "", `/battle?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}&days=${days}`);
  const btn = $("fight-btn");
  setBusy(btn, true, "Fighting…");
  try {
    const r = await api(`/api/battle?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}&days=${days}`);
    render(r);
  } catch (err) {
    $("err").textContent = err.message;
  } finally {
    setBusy(btn, false);
  }
}

function render(r) {
  const [fa, fb] = r.fighters;
  const side = (f) => `
    <div class="side ${r.winner === f.id ? "win" : ""}">
      <div class="crown">${r.winner === f.id ? "👑" : r.winner ? "💀" : "🤝"}</div>
      <h2 style="margin:4px 0"><a class="botname" href="/bot/${encodeURIComponent(f.id)}">${escapeHtml(f.name)}</a></h2>
      <div class="creator">@${escapeHtml(f.creator)}</div>
      <div class="big-num" style="margin-top:10px">${pct(f.stats.returnPct)}</div>
    </div>`;
  $("vs").innerHTML = `${side(fa)}<div class="vs-mark">VS</div>${side(fb)}`;
  lineChart($("chart"), {
    baseline: 10000,
    series: [
      { name: fa.name, points: fa.curve, color: "var(--series-1)" },
      { name: fb.name, points: fb.curve, color: "var(--series-2)" },
      { name: "Bitcoin", points: r.benchmark, color: "var(--ink-3)", dash: true },
    ],
  });
  $("compare").innerHTML = [fa, fb]
    .map(
      (f) => `<div class="card">
        <h3>${escapeHtml(f.name)}</h3>
        <div class="grid cols-2" style="margin-bottom:14px">${statTiles(f.stats)}</div>
        <div class="rules">${rulesHtml(f.rules)}</div>
      </div>`,
    )
    .join("");
  $("arena").classList.remove("hidden");
  $("arena").scrollIntoView({ behavior: "smooth", block: "start" });

  $("share-btn").onclick = async () => {
    const winner = r.fighters.find((f) => f.id === r.winner);
    const text = winner
      ? `⚔️ ${fa.name} vs ${fb.name}: ${winner.name} wins with ${winner.stats.returnPct}% over ${r.days} days. Build a bot that beats them on Botfolio.`
      : `⚔️ ${fa.name} vs ${fb.name} ended in a draw on Botfolio.`;
    const res = await share({ title: "Bot Battle on Botfolio", text, url: location.href });
    if (res === "copied") {
      $("share-btn").textContent = "✅ Link copied";
      setTimeout(() => ($("share-btn").textContent = "🔗 Share this battle"), 1800);
    }
  };
}

$("pick").addEventListener("submit", (e) => {
  e.preventDefault();
  fight();
});

init().catch(() => ($("err").textContent = "Couldn't load bots right now."));
