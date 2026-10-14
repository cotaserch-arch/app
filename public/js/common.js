// Shared helpers and page chrome: header, live scores strip, join flow, ads.

export const $ = (id) => document.getElementById(id);

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const coins = (n) => `🪙 ${Math.floor(n ?? 0).toLocaleString()}`;
export const ml = (n) => (n == null ? "–" : n > 0 ? `+${n}` : `${n}`);
export const signed = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(Math.round(n)).toLocaleString()}`;

export function localDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function kickoff(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function statusLabel(g) {
  if (g.status === "live") return `<span class="status-live"><span class="live-dot"></span>LIVE · ${escapeHtml(g.clock || "")}</span>`;
  if (g.status === "final") return `<span>${escapeHtml(g.clock || "Final")}</span>`;
  return `<span>${kickoff(g.startsAt)}</span>`;
}

export function teamLogo(t) {
  return `<span class="team-logo">${t.logo ? `<img src="${escapeHtml(t.logo)}" alt="" loading="lazy">` : escapeHtml((t.abbr || t.short || "?").slice(0, 3))}</span>`;
}

// ---------- Fan identity (per browser) ----------

const TOKEN_KEY = "clutch.token";
export function token() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}
export function setToken(t) {
  try {
    localStorage.setItem(TOKEN_KEY, t);
  } catch {
    // Private mode; the session still works until the tab closes.
  }
  sessionToken = t;
  tellNativeApp();
}

// Inside the iPhone/Android app, hand the fan code to the native shell so it
// can register this device for push notifications.
function tellNativeApp() {
  const t = token() || sessionToken;
  if (t && window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: "fan", token: t }));
}
let sessionToken = "";

export async function api(path, { method = "GET", body } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  const t = token() || sessionToken;
  if (t) headers["x-fan-token"] = t;
  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let data = {};
  try {
    data = await res.json();
  } catch {
    // Non-JSON error.
  }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

let configPromise;
export const config = () => (configPromise ??= api("/api/config"));

let mePromise = null;
export function me({ refresh = false } = {}) {
  if (!token() && !sessionToken) return Promise.resolve(null);
  if (refresh || !mePromise) mePromise = api("/api/me").catch(() => null);
  return mePromise;
}

// Asks for a handle the first time someone tries to play. Resolves when joined.
export function ensureFan() {
  if (token() || sessionToken) return Promise.resolve(true);
  return new Promise((resolve) => {
    const back = document.createElement("div");
    back.className = "modal-back";
    back.innerHTML = `
      <form class="card glow modal" autocomplete="off">
        <h2 style="font-style:italic">Join Clutch 🏆</h2>
        <p class="muted">Pick a handle and get <b class="num">1,000</b> free coins. No email, no password.</p>
        <label for="join-handle">Your handle</label>
        <input id="join-handle" maxlength="20" required pattern="[A-Za-z0-9_.\\-]{2,20}" placeholder="e.g. clutch_king">
        <button class="btn block" style="margin-top:14px" type="submit">Let's go</button>
        <button class="btn ghost block" style="margin-top:8px" type="button" data-close>Not now</button>
        <div class="error" role="alert"></div>
      </form>`;
    document.body.append(back);
    const form = back.querySelector("form");
    const input = back.querySelector("input");
    input.focus();
    const close = (ok) => {
      back.remove();
      resolve(ok);
    };
    back.querySelector("[data-close]").addEventListener("click", () => close(false));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const errBox = back.querySelector(".error");
      errBox.textContent = "";
      try {
        const ref = new URLSearchParams(location.search).get("ref");
        const { token: t } = await api("/api/fans", { method: "POST", body: { handle: input.value.trim(), ref } });
        setToken(t);
        await refreshCoins();
        toast(ref ? "🎉 Welcome! Referral bonus added." : "🎉 Welcome to Clutch! 1,000 coins added.");
        close(true);
      } catch (err) {
        errBox.textContent = err.message;
      }
    });
  });
}

// ---------- Chrome ----------

const NAV = [
  ["/", "Today", "today"],
  ["/bots", "Bots", "bots"],
  ["/leaders", "Leaders", "leaders"],
  ["/pro", "Pro", "pro"],
];

export async function refreshCoins() {
  const slot = $("coin-slot");
  if (!slot) return;
  const data = await me({ refresh: true });
  slot.innerHTML = data
    ? `<a class="coin-chip" href="/me" title="Your profile">${coins(data.profile.coins)}</a>`
    : `<button class="btn sm" type="button" id="join-btn">Join</button>`;
  $("join-btn")?.addEventListener("click", () => ensureFan());
}

export function renderShell(active) {
  const header = document.createElement("header");
  header.className = "site-header";
  header.innerHTML = `
    <div class="wrap">
      <a class="logo" href="/"><span class="logo-mark" aria-hidden="true">⚡</span>Clutch</a>
      <nav class="nav">
        ${NAV.map(([href, label, key]) => `<a href="${href}" class="${key === active ? "active" : ""} ${key === "pro" ? "hide-sm" : ""}">${label}</a>`).join("")}
        <span id="coin-slot"></span>
      </nav>
    </div>`;
  const strip = document.createElement("div");
  strip.className = "scores hidden";
  document.body.prepend(header, strip);

  const footer = document.createElement("footer");
  footer.innerHTML = `
    <div class="wrap">
      <div class="row" style="align-items:flex-start">
        <div><strong>Clutch</strong> · The AI sports app <span id="source-note"></span></div>
        <div class="row start" style="gap:14px"><a href="/pro">Pro</a><a href="/pro#partners">Partners</a><a href="/privacy">Privacy</a></div>
      </div>
      <p>Free to play. Coins are for fun: they can't be bought, sold or cashed out. Clutch is not a sportsbook. Partner offers are only for adults 21+ in legal jurisdictions. Gambling problem? Call 1-800-GAMBLER.</p>
    </div>`;
  document.body.append(footer);

  refreshCoins();
  tellNativeApp();
  loadScores(strip);
  config()
    .then((c) => {
      $("source-note").innerHTML = c.source === "demo" ? '· <span class="badge demo">Demo league: fictional teams</span>' : "";
      renderAds(c.ads);
    })
    .catch(() => {});
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
}

async function loadScores(strip) {
  try {
    const { games } = await api(`/api/games?date=${localDate()}&tz=${new Date().getTimezoneOffset()}`);
    const shown = games.filter((g) => g.status === "live").concat(games.filter((g) => g.status === "final").slice(-4));
    if (!shown.length) return;
    strip.innerHTML = `<div class="scores-track">${shown
      .map(
        (g) => `<a class="score-pill" href="/game/${encodeURIComponent(g.id)}">${g.status === "live" ? '<span class="live-dot"></span>' : ""}
          <span>${escapeHtml(g.away.abbr || g.away.short)} <b class="num">${g.away.score}</b></span>
          <span>${escapeHtml(g.home.abbr || g.home.short)} <b class="num">${g.home.score}</b></span>
          <span class="muted">${escapeHtml(g.status === "live" ? g.clock : "F")}</span></a>`,
      )
      .join("")}</div>`;
    strip.classList.remove("hidden");
  } catch {
    // Scores are a nice-to-have.
  }
}

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
      slot.innerHTML = `<div class="ad-house"><div><div class="ad-tag">Sponsored</div><strong>Your brand here.</strong> Reach sports fans every game day: sportsbooks, sports drinks, streaming, gear.</div><a class="btn sm ghost" href="/pro#partners">Advertise →</a></div>`;
    }
  }
}

// ---------- Small UI helpers ----------

export function toast(text) {
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), 2600);
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

export async function share({ title, text, url }) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return;
    } catch {
      // Cancelled; fall back to copying.
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    toast("🔗 Copied! Paste it anywhere.");
  } catch {
    toast(url);
  }
}

export function badgesHtml(badges) {
  return badges.map((b) => `<span class="achievement" title="${escapeHtml(b.why)}">${b.icon} ${escapeHtml(b.name)}</span>`).join("");
}

export function rankLabel(rank) {
  return ["🥇", "🥈", "🥉"][rank - 1] || `#${rank}`;
}

export function sparkline(values, { width = 100, height = 28 } = {}) {
  if (!values?.length || values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${((i / (values.length - 1)) * (width - 2) + 1).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`)
    .join(" ");
  const up = values.at(-1) >= values[0];
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${up ? "var(--up)" : "var(--down)"}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}
