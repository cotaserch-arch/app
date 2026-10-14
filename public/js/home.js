import { api, escapeHtml, money, myRequests, rememberRequest, requestCard, setBusy, showAiMode } from "./common.js";

const askForm = document.getElementById("ask-form");
const askText = document.getElementById("ask-text");
const askBtn = document.getElementById("ask-btn");
const askError = document.getElementById("ask-error");
const draftForm = document.getElementById("draft-form");
const draftError = document.getElementById("draft-error");
const detailsBox = document.getElementById("d-details");

let current = null; // { draftId, text }

showAiMode(document.getElementById("ai-mode"));

document.getElementById("examples").addEventListener("click", (e) => {
  const chip = e.target.closest("[data-text]");
  if (!chip) return;
  askText.value = chip.dataset.text;
  askText.focus();
});

async function loadCategories() {
  const { categories } = await api("/api/config");
  document.getElementById("d-category").innerHTML = categories
    .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
    .join("");
}
const categoriesReady = loadCategories().catch(() => {});

function detailRow(label = "", value = "") {
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML = `
    <input placeholder="Label" maxlength="60" value="${escapeHtml(label)}" aria-label="Fact label">
    <input placeholder="Value" maxlength="200" value="${escapeHtml(value)}" aria-label="Fact value">
    <button type="button" class="btn secondary small" aria-label="Remove fact">✕</button>`;
  row.querySelector("button").addEventListener("click", () => row.remove());
  detailsBox.append(row);
}

document.getElementById("add-detail").addEventListener("click", () => detailRow());

askForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  askError.textContent = "";
  const text = askText.value.trim();
  if (text.length < 10) {
    askError.textContent = "Tell us a bit more about what you need.";
    return;
  }
  setBusy(askBtn, true, "Writing your request…");
  try {
    const { draftId, draft, source } = await api("/api/requests/draft", { method: "POST", body: { text } });
    await categoriesReady;
    current = { draftId, text };
    fillDraft(draft, source);
    askForm.classList.add("hidden");
    draftForm.classList.remove("hidden");
    draftForm.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    askError.textContent = err.message;
  } finally {
    setBusy(askBtn, false);
  }
});

function fillDraft(draft, source) {
  document.getElementById("draft-source").textContent =
    source === "ai"
      ? "AI wrote this from your description. Check it, edit anything, then post."
      : "We pulled out the key facts. Check them, fill in anything missing, then post.";
  document.getElementById("d-title").value = draft.title;
  document.getElementById("d-category").value = draft.category;
  document.getElementById("d-location").value = draft.location;
  document.getElementById("d-timeline").value = draft.timeline;
  document.getElementById("d-budget").value = draft.budget;
  document.getElementById("d-summary").value = draft.summary;

  detailsBox.innerHTML = "";
  draft.details.forEach((d) => detailRow(d.label, d.value));

  const estimate = document.getElementById("estimate");
  if (draft.price_estimate) {
    const p = draft.price_estimate;
    estimate.innerHTML = `<div>Typical price: <strong>${escapeHtml(money(p.low, p.currency))} – ${escapeHtml(money(p.high, p.currency))}</strong></div><p>${escapeHtml(p.basis)}</p>`;
    estimate.classList.remove("hidden");
  } else {
    estimate.classList.add("hidden");
  }

  const missing = document.getElementById("missing");
  if (draft.missing_info.length) {
    missing.innerHTML = `<strong>Add these for more accurate quotes:</strong><ul>${draft.missing_info
      .map((m) => `<li>${escapeHtml(m)}</li>`)
      .join("")}</ul>`;
    missing.classList.remove("hidden");
  } else {
    missing.classList.add("hidden");
  }
}

document.getElementById("draft-back").addEventListener("click", () => {
  draftForm.classList.add("hidden");
  askForm.classList.remove("hidden");
  askText.focus();
});

draftForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  draftError.textContent = "";
  const postBtn = document.getElementById("post-btn");
  const form = new FormData(draftForm);
  const details = [...detailsBox.querySelectorAll(".row")]
    .map((row) => {
      const [label, value] = row.querySelectorAll("input");
      return { label: label.value.trim(), value: value.value.trim() };
    })
    .filter((d) => d.label && d.value);
  const body = {
    draftId: current.draftId,
    text: current.text,
    title: form.get("title"),
    category: form.get("category"),
    location: form.get("location"),
    timeline: form.get("timeline"),
    budget: form.get("budget"),
    summary: form.get("summary"),
    contactName: form.get("contactName"),
    details,
  };
  setBusy(postBtn, true, "Posting…");
  try {
    const { id, ownerToken } = await api("/api/requests", { method: "POST", body });
    rememberRequest({ id, token: ownerToken, title: body.title, createdAt: new Date().toISOString() });
    window.location.href = `/r/${encodeURIComponent(id)}?new=1`;
  } catch (err) {
    draftError.textContent = err.message;
    setBusy(postBtn, false);
  }
});

async function loadMine() {
  const mine = myRequests();
  if (!mine.length) return;
  const results = await Promise.all(
    mine.slice(0, 6).map((m) => api(`/api/requests/${encodeURIComponent(m.id)}`, { owner: m.id }).catch(() => null)),
  );
  const cards = results.filter(Boolean).map((r) => requestCard(r.request));
  if (!cards.length) return;
  document.getElementById("mine-list").innerHTML = cards.join("");
  document.getElementById("mine-section").classList.remove("hidden");
}

async function loadFeed() {
  const feed = document.getElementById("feed");
  try {
    const { requests } = await api("/api/requests?limit=6");
    feed.innerHTML = requests.length
      ? requests.map((r) => requestCard(r)).join("")
      : '<p class="muted">No open requests yet. Be the first!</p>';
  } catch {
    feed.innerHTML = '<p class="muted">Couldn\'t load requests right now.</p>';
  }
}

loadMine();
loadFeed();
