// Shared helpers and page chrome (header, ticker, footer, ads, app install).

export const $ = (id) => document.getElementById(id);

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function usd(n, { compact = false } = {}) {
  if (n == null) return "–";
  const digits = Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 1 ? 2 : 4;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : digits,
  }).format(n);
}

// Signed percentage with an arrow, so up/down never relies on color alone.
export function pct(n, { arrow = true } = {}) {
  if (n == null) return '<span class="flat">–</span>';
  const cls = n > 0 ? "up" : n < 0 ? "down" : "flat";
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  const icon = arrow ? (n > 0 ? "▲ " : n < 0 ? "▼ " : "") : "";
  return `<span class="num ${cls}">${icon}${sign}${Math.abs(n).toFixed(2)}%</span>`;
}

export function rankLabel(rank) {
  return ["🥇", "🥈", "🥉"][rank - 1] || `#${rank}`;
}

export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = {};
  try {
    data = await res.json();
  } catch {
    // Non-JSON error.
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export function setBusy(button, busy, label) {
  if (busy) {
    button.dataset.label = button.innerHTML;
    button.disabled = true;
    button.innerHTML = `<span class="spinner" aria-hidden="true"></span> ${escapeHtml(label)}`;
  } else {
    button.disabled = false;
    if (button.dataset.label) button.innerHTML = button.dataset.label;
  }
}

// ---------- Local preferences (per browser) ----------

function readLocal(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode); nothing to remember.
  }
}
export const myBots = () => readLocal("botfolio.mine", []);
export const rememberBot = (id) => writeLocal("botfolio.mine", [id, ...myBots().filter((x) => x !== id)].slice(0, 50));
export const traderName = () => readLocal("botfolio.trader", "");
export const saveTraderName = (name) => writeLocal("botfolio.trader", name);
export const hyped = () => readLocal("botfolio.hyped", {});
export function markHyped(id) {
  const today = new Date().toISOString().slice(0, 10);
  writeLocal("botfolio.hyped", { ...hyped(), [id]: today });
}
export const hypedToday = (id) => hyped()[id] === new Date().toISOString().slice(0, 10);

export async function hype(id, button) {
  if (hypedToday(id)) return;
  try {
    const { hype: count } = await api(`/api/bots/${encodeURIComponent(id)}/hype`, { method: "POST", body: {} });
    markHyped(id);
    button.classList.add("done");
    button.innerHTML = `🔥 ${count}`;
  } catch {
    // Rate-limited or offline; ignore.
  }
}

// ---------- Page chrome ----------

let configPromise;
export const config = () => (configPromise ??= api("/api/config"));

const NAV = [
  ["/", "Build", "build"],
  ["/league", "League", "league"],
  ["/battle", "Battle", "battle"],
  ["/pro", "Pro", "pro"],
];

export function renderShell(active) {
  const header = document.createElement("header");
  header.className = "site-header";
  header.innerHTML = `
    <div class="wrap">
      <a class="logo" href="/"><span class="logo-mark" aria-hidden="true">🤖</span>Botfolio</a>
      <nav class="nav">
        ${NAV.map(([href, label, key]) => `<a href="${href}" class="${key === active ? "active" : ""} ${key === "build" ? "hide-sm" : ""}">${label}</a>`).join("")}
        <button class="btn sm hidden" id="install-btn" type="button">Install app</button>
      </nav>
    </div>`;
  const tickerBar = document.createElement("div");
  tickerBar.className = "ticker";
  tickerBar.setAttribute("aria-label", "Crypto prices");
  document.body.prepend(header, tickerBar);

  const footer = document.createElement("footer");
  footer.innerHTML = `
    <div class="wrap row">
      <div>
        <strong>Botfolio</strong> · The AI trading league
        <p>Paper trading only. Every bot trades simulated money, and nothing here is financial advice. Backtests and past results don't predict future returns.</p>
      </div>
      <div class="muted" id="data-source"></div>
    </div>`;
  document.body.append(footer);

  loadTicker(tickerBar);
  setupInstall();
  config()
    .then((c) => {
      $("data-source").innerHTML =
        c.market.source === "live"
          ? `Prices: Coinbase, through ${escapeHtml(c.market.lastDate)}`
          : `Prices: <b>simulated market</b> (live prices connect when deployed)`;
      renderAds(c.ads);
    })
    .catch(() => {});

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
}

async function loadTicker(bar) {
  try {
    const { ticker, source } = await api("/api/market");
    const items = ticker
      .map((t) => `<span class="tick"><b>${t.asset}</b><span class="px num">${usd(t.price)}</span>${pct(t.change24hPct)}</span>`)
      .join("");
    const tag = source === "live" ? "" : '<span class="tick"><span class="badge sim">SIMULATED MARKET</span></span>';
    bar.innerHTML = `<div class="ticker-track">${tag}${items}${tag}${items}</div>`;
  } catch {
    bar.remove();
  }
}

function setupInstall() {
  let deferred = null;
  const btn = $("install-btn");
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    btn.classList.remove("hidden");
  });
  btn.addEventListener("click", async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice.catch(() => {});
    deferred = null;
    btn.classList.add("hidden");
  });
}

// Ad slots: Google AdSense when configured, a direct sponsor when set,
// otherwise a house ad selling the slot.
let adsenseLoaded = false;
function renderAds(ads) {
  for (const slot of document.querySelectorAll(".ad-slot")) {
    if (ads.adsenseClient && ads.adsenseSlot) {
      if (!adsenseLoaded) {
        const s = document.createElement("script");
        s.async = true;
        s.crossOrigin = "anonymous";
        s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(ads.adsenseClient)}`;
        document.head.append(s);
        adsenseLoaded = true;
      }
      slot.innerHTML = `<div class="ad-tag">Advertisement</div><ins class="adsbygoogle" style="display:block" data-ad-client="${escapeHtml(ads.adsenseClient)}" data-ad-slot="${escapeHtml(ads.adsenseSlot)}" data-ad-format="auto" data-full-width-responsive="true"></ins>`;
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } else if (ads.sponsor) {
      slot.innerHTML = `<a class="ad-house" href="${escapeHtml(ads.sponsor.url)}" rel="sponsored noopener" target="_blank"><div><div class="ad-tag">Sponsored</div><strong>${escapeHtml(ads.sponsor.name)}</strong> ${escapeHtml(ads.sponsor.text)}</div><span class="btn sm ghost">Learn more →</span></a>`;
    } else {
      slot.innerHTML = `<div class="ad-house"><div><div class="ad-tag">Sponsored</div><strong>Your brand here.</strong> Put your exchange, wallet or app in front of crypto traders every day.</div><a class="btn sm ghost" href="/pro#sponsor">Sponsor a season →</a></div>`;
    }
  }
}

// ---------- Shared bits of UI ----------

export function sparkline(values, { width = 110, height = 32 } = {}) {
  if (!values?.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${((i / Math.max(1, values.length - 1)) * (width - 2) + 1).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`)
    .join(" ");
  const up = values.at(-1) >= values[0];
  return `<svg class="spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${up ? "var(--up)" : "var(--down)"}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

export function boardRows(bots, { compact = false } = {}) {
  return bots
    .map(
      (b) => `
      <tr data-href="/bot/${encodeURIComponent(b.id)}">
        <td class="rank">${rankLabel(b.rank)}</td>
        <td>
          <a class="botname" href="/bot/${encodeURIComponent(b.id)}">${escapeHtml(b.name)}</a>
          ${b.sample ? '<span class="badge">Sample</span>' : ""}
          <div class="creator">@${escapeHtml(b.creator)} · ${b.daysLive}d live <span class="badge-icons" title="${escapeHtml(b.badges.map((x) => x.name).join(", "))}">${b.badges.map((x) => x.icon).join("")}</span></div>
        </td>
        <td class="r">${pct(b.returnPct)}</td>
        <td class="r hide-sm">${pct(b.returnPct - b.benchmarkReturnPct, { arrow: false })}</td>
        <td class="hide-sm">${sparkline(b.spark)}</td>
        ${compact ? "" : `<td class="hide-sm small muted">${escapeHtml(b.holdings.join(", ") || "Cash")}</td>`}
        <td class="r"><button class="hype-btn ${hypedToday(b.id) ? "done" : ""}" data-hype="${escapeHtml(b.id)}" aria-label="Hype ${escapeHtml(b.name)}">🔥 ${b.hype}</button></td>
      </tr>`,
    )
    .join("");
}

export function boardTable(bots, opts = {}) {
  return `
    <div class="table-wrap"><table class="board">
      <thead><tr>
        <th>Rank</th><th>Bot</th><th class="r">Return</th><th class="r hide-sm">vs BTC</th><th class="hide-sm">Trend</th>
        ${opts.compact ? "" : '<th class="hide-sm">Holding</th>'}<th class="r">Hype</th>
      </tr></thead>
      <tbody>${boardRows(bots, opts)}</tbody>
    </table></div>`;
}

// Row clicks open the bot; hype buttons hype.
export function wireBoard(container) {
  container.addEventListener("click", (e) => {
    const hypeBtn = e.target.closest("[data-hype]");
    if (hypeBtn) {
      e.preventDefault();
      e.stopPropagation();
      hype(hypeBtn.dataset.hype, hypeBtn);
      return;
    }
    if (e.target.closest("a")) return;
    const row = e.target.closest("tr[data-href]");
    if (row) location.href = row.dataset.href;
  });
}

export function rulesHtml(sections) {
  return sections
    .map((s) => `<h4>${escapeHtml(s.title)}</h4><ul>${s.items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>`)
    .join("");
}

export function statTiles(stats) {
  const tiles = [
    ["Return", pct(stats.returnPct)],
    ["vs Bitcoin", pct(stats.returnPct - stats.benchmarkReturnPct, { arrow: false })],
    ["Worst drop", `<span class="num">${stats.maxDrawdownPct.toFixed(1)}%</span>`],
    ["Win rate", stats.winRatePct == null ? '<span class="flat">–</span>' : `<span class="num">${stats.winRatePct}%</span>`],
    ["Trades", `<span class="num">${stats.buys}</span>`],
  ];
  return tiles.map(([label, value]) => `<div class="stat"><div class="label">${label}</div><div class="value">${value}</div></div>`).join("");
}

export function coachHtml(c) {
  const list = (items) => items.map((i) => `<li>${escapeHtml(i)}</li>`).join("");
  return `
    <div class="coach">
      <div class="grade ${escapeHtml(c.grade)}" aria-label="Grade ${escapeHtml(c.grade)}">${escapeHtml(c.grade)}</div>
      <div>
        <div class="row" style="justify-content:flex-start;gap:8px"><strong>AI Coach</strong><span class="badge brand">${c.source === "ai" ? "✨ Claude" : "Quick review"}</span></div>
        <h3 style="margin:6px 0 10px;font-size:1.15rem">${escapeHtml(c.verdict)}</h3>
        ${c.strengths.length ? `<div class="up small"><b>What works</b></div><ul>${list(c.strengths)}</ul>` : ""}
        ${c.weaknesses.length ? `<div class="down small"><b>What hurts</b></div><ul>${list(c.weaknesses)}</ul>` : ""}
        <div><b>💡 Try next:</b> ${escapeHtml(c.suggestion)}</div>
      </div>
    </div>`;
}

export async function share({ title, text, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return "shared";
    } catch {
      // Cancelled; fall through to copying.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
