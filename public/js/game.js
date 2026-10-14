import {
  $, api, coins, ensureFan, escapeHtml, kickoff, me, ml, refreshCoins, renderShell, share, statusLabel, teamLogo, toast,
} from "./common.js";

renderShell("today");

const id = decodeURIComponent(location.pathname.split("/")[2] || "");
let data = null; // { game, preview, markets, myPick, coins, partner }
let since = 0;
let reactionList = [];
let myHandle = null;
let tab = null;

async function load() {
  try {
    data = await api(`/api/games/${encodeURIComponent(id)}`);
  } catch {
    $("loading").classList.add("hidden");
    $("missing").classList.remove("hidden");
    return;
  }
  const cfg = await api("/api/config");
  reactionList = cfg.reactions;
  myHandle = (await me())?.profile.handle ?? null;
  renderAll();
  $("loading").classList.add("hidden");
  $("page").classList.remove("hidden");
  const requested = location.hash.replace("#", "");
  showTab(["party", "preview", "markets"].includes(requested) ? requested : data.game.status === "scheduled" ? "preview" : "party");
  poll();
}

function renderAll() {
  renderHeader();
  renderPreview();
  renderMarkets();
  renderOdds();
}

function renderHeader() {
  const g = data.game;
  document.title = `${g.away.short} @ ${g.home.short} · Clutch`;
  $("league").textContent = g.league;
  $("status").innerHTML = statusLabel(g);
  const side = (s) => `
    <div>
      ${teamLogo(g[s])}
      <div class="t-name">${escapeHtml(g[s].name)}</div>
      <div class="small muted">${escapeHtml(g[s].record || "")}${s === "home" ? " · home" : ""}</div>
      <div class="t-score">${g[s].score ?? "–"}</div>
    </div>`;
  $("scoreboard").innerHTML = `${side("away")}<div class="mid">${g.status === "scheduled" ? kickoff(g.startsAt) : g.status === "live" ? "LIVE" : "FINAL"}</div>${side("home")}`;

  const open = g.status === "scheduled";
  $("pick-row").innerHTML = ["away", "home"]
    .map((s) => {
      const mine = data.myPick === s;
      const result = g.status === "final" && mine ? (g.winner === s ? "won" : "lost") : "";
      return `<button class="pick-btn ${mine ? "mine" : ""} ${result}" data-pick="${s}" ${open ? "" : "disabled"}>${mine ? "✓ " : ""}${escapeHtml(g[s].short)} to win</button>`;
    })
    .join("");
  const bot = g[data.preview.pick];
  $("pick-note").innerHTML = open
    ? `🤖 The Bot picks <b>${escapeHtml(bot.short)}</b> (${data.preview.win_probability}%). ${data.myPick ? "Change your pick until kickoff." : "Make your call!"}`
    : data.myPick
      ? `Your pick: <b>${escapeHtml(g[data.myPick].short)}</b> · Bot: <b>${escapeHtml(bot.short)}</b>`
      : "Picks are locked for this game.";
}

function renderPreview() {
  const p = data.preview;
  const g = data.game;
  const team = g[p.pick];
  $("tab-preview").innerHTML = `
    <div class="row start" style="gap:8px;margin-bottom:10px"><span class="badge brand">${p.source === "ai" ? "✨ AI analyst" : "🤖 Bot model"}</span>${p.upset_alert ? '<span class="badge upset">⚠️ Upset alert</span>' : ""}</div>
    <div class="ai-pick">
      <div class="ai-pct">${p.win_probability}%</div>
      <div><div class="muted small">The Bot's pick</div><h2 style="margin:2px 0 0">${escapeHtml(team.name)}</h2></div>
    </div>
    <div class="prob" style="margin:14px 0"><span style="width:${p.win_probability}%"></span></div>
    <h3>${escapeHtml(p.headline)}</h3>
    <p>${escapeHtml(p.analysis)}</p>
    <p class="muted small" style="margin:0"><b>Key factor:</b> ${escapeHtml(p.key_factor)}</p>`;
}

function renderOdds() {
  const g = data.game;
  const o = g.odds;
  $("odds-card").innerHTML = `
    <h3>The line</h3>
    ${
      o
        ? `<table class="board"><tbody>
            <tr><td>${escapeHtml(g.away.short)}</td><td class="r num">${ml(o.awayML)}</td></tr>
            <tr><td>${escapeHtml(g.home.short)}</td><td class="r num">${ml(o.homeML)}</td></tr>
            ${o.drawML ? `<tr><td>Draw</td><td class="r num">${ml(o.drawML)}</td></tr>` : ""}
            ${o.total != null ? `<tr><td>Total</td><td class="r num">${o.total}</td></tr>` : ""}
          </tbody></table>`
        : '<p class="muted small">No line posted yet.</p>'
    }`;
  if (data.partner && g.status === "scheduled") {
    $("partner-card").innerHTML = `<div class="ad-tag">Partner</div><h3>Feeling it?</h3><a class="btn block" href="${escapeHtml(data.partner.url)}" target="_blank" rel="sponsored noopener">Bet it at ${escapeHtml(data.partner.name)} ↗</a><p class="small muted" style="margin:8px 0 0">${escapeHtml(data.partner.terms)}</p>`;
    $("partner-card").classList.remove("hidden");
  }
}

function renderMarkets() {
  const box = $("tab-markets");
  box.innerHTML =
    `<div class="card"><div class="row"><div><strong>Fan prediction market</strong><div class="small muted">Buy YES or NO with coins. Each winning share pays 🪙 1. Prices are the crowd's odds.</div></div><span class="coin-chip">${data.coins != null ? coins(data.coins) : "Join to trade"}</span></div></div>` +
    data.markets
      .map((m) => {
        const yes = Math.round(m.price * 100);
        const pos = m.positions
          .map(
            (p) =>
              `<div class="small">You hold <b class="num">${p.shares}</b> ${p.outcome.toUpperCase()} shares (cost ${coins(p.cost)})${
                p.settled ? ` · paid ${coins(p.payout)}` : m.status === "open" ? ` · <a href="#" data-sell="${escapeHtml(m.id)}" data-outcome="${p.outcome}">sell</a>` : ""
              }</div>`,
          )
          .join("");
        const result = m.resolution ? `<span class="badge ${m.resolution === "yes" ? "won" : "lost"}">Resolved ${m.resolution.toUpperCase()}</span>` : m.status === "closed" ? '<span class="badge">Closed at kickoff</span>' : '<span class="badge live">Open</span>';
        return `
          <div class="card market">
            <div class="row"><div class="market-q">${escapeHtml(m.question)}</div>${result}</div>
            <div class="price-bar"><div class="yes" style="width:${Math.max(18, yes)}%">YES ${yes}¢</div><div class="no">NO ${100 - yes}¢</div></div>
            <div class="small muted">${m.trades} trades · ${coins(m.volume)} volume</div>
            ${pos}
            ${
              m.status === "open"
                ? `<form class="trade-row" data-market="${escapeHtml(m.id)}">
                    <input type="number" min="1" step="1" value="50" inputmode="numeric" aria-label="Coins to spend">
                    <button class="btn yes" data-outcome="yes" type="submit">Buy YES</button>
                    <button class="btn no" data-outcome="no" type="submit">Buy NO</button>
                  </form>`
                : ""
            }
          </div>`;
      })
      .join("");
}

function showTab(name) {
  tab = name;
  for (const t of ["party", "preview", "markets"]) $(`tab-${t}`).classList.toggle("hidden", t !== name);
  document.querySelectorAll(".tab[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  history.replaceState(null, "", `#${name}`);
  if (name === "party") scrollFeed();
}

document.querySelector(".tabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-tab]");
  if (b) showTab(b.dataset.tab);
});

$("pick-row").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-pick]");
  if (!btn || btn.disabled) return;
  if (!(await ensureFan())) return;
  try {
    await api(`/api/games/${encodeURIComponent(id)}/pick`, { method: "POST", body: { side: btn.dataset.pick } });
    data.myPick = btn.dataset.pick;
    renderHeader();
    toast("Pick locked in ✓");
  } catch (err) {
    toast(err.message);
  }
});

$("tab-markets").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target.closest("[data-market]");
  const outcome = e.submitter?.dataset.outcome || "yes";
  if (!(await ensureFan())) return;
  try {
    const r = await api(`/api/markets/${encodeURIComponent(form.dataset.market)}/trade`, {
      method: "POST",
      body: { action: "buy", outcome, coins: Number(form.querySelector("input").value) },
    });
    applyTrade(r);
    toast(`Bought ${outcome.toUpperCase()} ✓`);
  } catch (err) {
    toast(err.message);
  }
});

$("tab-markets").addEventListener("click", async (e) => {
  const link = e.target.closest("[data-sell]");
  if (!link) return;
  e.preventDefault();
  try {
    const r = await api(`/api/markets/${encodeURIComponent(link.dataset.sell)}/trade`, { method: "POST", body: { action: "sell", outcome: link.dataset.outcome } });
    applyTrade(r);
    toast("Sold ✓");
  } catch (err) {
    toast(err.message);
  }
});

function applyTrade(r) {
  data.coins = Math.floor(r.coins);
  data.markets = data.markets.map((m) => (m.id === r.market.id ? r.market : m));
  renderMarkets();
  refreshCoins();
}

// ---------- Watch party ----------

function scrollFeed() {
  const feed = $("feed");
  feed.scrollTop = feed.scrollHeight;
}

const BLOCK_KEY = "clutch.blocked";
function blocked() {
  try {
    return new Set(JSON.parse(localStorage.getItem(BLOCK_KEY)) || []);
  } catch {
    return new Set();
  }
}

function addMessages(msgs) {
  const feed = $("feed");
  const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 60;
  const hide = blocked();
  for (const m of msgs) {
    if (m.kind === "chat" && hide.has(m.handle)) continue;
    const el = document.createElement("div");
    const mine = m.handle === myHandle;
    el.className = `msg ${m.kind === "ai" ? "ai" : ""} ${mine ? "me" : ""}`;
    el.dataset.handle = m.handle;
    const tools = m.kind === "chat" && !mine
      ? `<span class="msg-tools"><a href="#" data-report="${m.n}">Report</a> · <a href="#" data-block="${escapeHtml(m.handle)}">Block</a></span>`
      : "";
    el.innerHTML = `<div class="h">${m.kind === "ai" ? "⚡ " : ""}${escapeHtml(m.handle)}${tools}</div><div>${escapeHtml(m.text)}</div>`;
    feed.append(el);
  }
  if (!feed.children.length) feed.innerHTML = '<div class="empty small">The room is quiet. Say something!</div>';
  if (atBottom || msgs.length) scrollFeed();
}

function renderReactions(counts) {
  $("reactions").innerHTML = reactionList
    .map((e) => `<button class="react" data-emoji="${e}" aria-label="React ${e}">${e}<span class="c">${counts[e] || ""}</span></button>`)
    .join("");
}

async function poll() {
  try {
    const r = await api(`/api/games/${encodeURIComponent(id)}/room?since=${since}`);
    if (r.messages.length) {
      $("feed").querySelector(".empty")?.remove();
      since = r.messages.at(-1).n;
      addMessages(r.messages);
    } else if (!$("feed").children.length) {
      addMessages([]);
    }
    renderReactions(r.reactions);
    $("watching").textContent = `👀 ${r.watching} watching`;
    const changed = r.game.status !== data.game.status || r.game.home.score !== data.game.home.score || r.game.away.score !== data.game.away.score;
    if (changed) {
      data.game = r.game;
      renderHeader();
      if (r.game.status !== "scheduled") {
        // Markets close at kickoff and resolve at the final whistle.
        const fresh = await api(`/api/games/${encodeURIComponent(id)}`);
        data.markets = fresh.markets;
        renderMarkets();
      }
    } else {
      data.game = r.game;
      $("status").innerHTML = statusLabel(r.game);
    }
  } catch {
    // Network blip; try again next tick.
  }
  setTimeout(poll, document.hidden ? 15_000 : data.game.status === "live" ? 4_000 : 12_000);
}

$("chat-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $("chat-input");
  const text = input.value.trim();
  if (!text) return;
  if (!(await ensureFan())) return;
  myHandle = (await me())?.profile.handle ?? myHandle;
  try {
    await api(`/api/games/${encodeURIComponent(id)}/chat`, { method: "POST", body: { text } });
    input.value = "";
    const r = await api(`/api/games/${encodeURIComponent(id)}/room?since=${since}`);
    if (r.messages.length) {
      $("feed").querySelector(".empty")?.remove();
      since = r.messages.at(-1).n;
      addMessages(r.messages);
    }
  } catch (err) {
    toast(err.message);
  }
});

$("feed").addEventListener("click", async (e) => {
  const rep = e.target.closest("[data-report]");
  const blk = e.target.closest("[data-block]");
  if (!rep && !blk) return;
  e.preventDefault();
  if (rep) {
    try {
      await api(`/api/games/${encodeURIComponent(id)}/report`, { method: "POST", body: { n: Number(rep.dataset.report) } });
      rep.closest(".msg").remove();
      toast("Thanks. We've flagged that message.");
    } catch (err) {
      toast(err.message);
    }
  } else {
    const handle = blk.dataset.block;
    if (!confirm(`Block @${handle}? You won't see their messages anymore.`)) return;
    const list = blocked();
    list.add(handle);
    try {
      localStorage.setItem(BLOCK_KEY, JSON.stringify([...list]));
    } catch {
      // Storage unavailable; still hide for this visit.
    }
    $("feed").querySelectorAll(".msg").forEach((m) => m.dataset.handle === handle && m.remove());
    toast(`Blocked @${handle}.`);
  }
});

$("reactions").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-emoji]");
  if (!b) return;
  try {
    const r = await api(`/api/games/${encodeURIComponent(id)}/react`, { method: "POST", body: { emoji: b.dataset.emoji } });
    renderReactions(r.reactions);
  } catch {
    // ignore
  }
});

$("share-btn").addEventListener("click", () => {
  const g = data.game;
  const bot = g[data.preview.pick];
  share({
    title: "Clutch",
    text: `${g.away.short} @ ${g.home.short}: the AI picks ${bot.short} (${data.preview.win_probability}%). Think you can beat it?`,
    url: `${location.origin}/game/${encodeURIComponent(g.id)}`,
  });
});

load();
