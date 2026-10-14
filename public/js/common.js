// Shared helpers for every page.
const MINE_KEY = "cotasearch.mine";

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function money(amount, currency = "USD") {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString()}`;
  }
}

export function timeAgo(iso) {
  const seconds = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  const units = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [name, size] of units) {
    const n = Math.floor(seconds / size);
    if (n >= 1) return `${n} ${name}${n === 1 ? "" : "s"} ago`;
  }
  return "just now";
}

// Requests this browser posted, with the private token that proves ownership.
export function myRequests() {
  try {
    return JSON.parse(localStorage.getItem(MINE_KEY)) || [];
  } catch {
    return [];
  }
}

export function rememberRequest(entry) {
  try {
    const list = myRequests().filter((r) => r.id !== entry.id);
    list.unshift(entry);
    localStorage.setItem(MINE_KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    // Storage unavailable (private mode). The request still exists; the buyer
    // just won't be recognized as its owner on this device.
  }
}

export function ownerToken(id) {
  return myRequests().find((r) => r.id === id)?.token || "";
}

export async function api(path, { method = "GET", body, owner } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (owner) {
    const token = ownerToken(owner);
    if (token) headers["x-owner-token"] = token;
  }
  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  let data = {};
  try {
    data = await res.json();
  } catch {
    // Non-JSON error page.
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

export function requestCard(r, { cta = "View" } = {}) {
  const meta = [r.location && `📍 ${escapeHtml(r.location)}`, r.timeline && `🗓 ${escapeHtml(r.timeline)}`, r.budget && `💰 ${escapeHtml(r.budget)}`]
    .filter(Boolean)
    .map((m) => `<span>${m}</span>`)
    .join("");
  const quotes = r.quoteCount === 1 ? "1 quote" : `${r.quoteCount} quotes`;
  return `
    <a class="card req-card" href="/r/${encodeURIComponent(r.id)}${cta === "Send quote" ? "#quote" : ""}">
      <div class="badges">
        <span class="badge brand">${escapeHtml(r.category)}</span>
        ${r.status === "awarded" ? '<span class="badge good">Hired</span>' : ""}
        ${r.sample ? '<span class="badge">Sample</span>' : ""}
      </div>
      <h3>${escapeHtml(r.title)}</h3>
      ${meta ? `<div class="meta">${meta}</div>` : ""}
      <div class="foot"><span>${quotes} · ${timeAgo(r.createdAt)}</span><strong>${cta} →</strong></div>
    </a>`;
}

export async function showAiMode(el) {
  if (!el) return;
  try {
    const { aiMode } = await api("/api/config");
    el.innerHTML =
      aiMode === "live"
        ? "⚡ <b>AI on</b>, powered by Claude"
        : "🧪 <b>Demo mode</b>: add an API key to turn on full AI";
  } catch {
    el.textContent = "";
  }
}
