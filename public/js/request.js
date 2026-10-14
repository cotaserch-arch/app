import { api, escapeHtml, money, setBusy, timeAgo } from "./common.js";

const id = decodeURIComponent(location.pathname.split("/")[2] || new URLSearchParams(location.search).get("id") || "");
const $ = (sel) => document.getElementById(sel);

let state = null; // { request, isOwner, quotes, analysis }

async function load() {
  try {
    state = await api(`/api/requests/${encodeURIComponent(id)}`, { owner: id });
  } catch {
    $("loading").classList.add("hidden");
    $("not-found").classList.remove("hidden");
    return;
  }
  render();
  $("loading").classList.add("hidden");
  $("page").classList.remove("hidden");
  if (location.hash === "#quote") $("quote")?.scrollIntoView({ block: "start" });
}

function render() {
  const { request, isOwner } = state;
  document.title = `${request.title} · CotaSearch`;

  $("badges").innerHTML = [
    `<span class="badge brand">${escapeHtml(request.category)}</span>`,
    request.status === "awarded" ? '<span class="badge good">Hired</span>' : '<span class="badge">Open for quotes</span>',
    request.sample ? '<span class="badge warn">Sample</span>' : "",
  ].join("");
  $("title").textContent = request.title;
  $("facts").innerHTML = [
    request.location && `<span>📍 <b>${escapeHtml(request.location)}</b></span>`,
    request.timeline && `<span>🗓 <b>${escapeHtml(request.timeline)}</b></span>`,
    request.budget && `<span>💰 Budget <b>${escapeHtml(request.budget)}</b></span>`,
    `<span>Posted ${timeAgo(request.createdAt)}${request.contactName ? ` by ${escapeHtml(request.contactName)}` : ""}</span>`,
  ]
    .filter(Boolean)
    .join("");

  $("summary").textContent = request.summary;
  $("details").innerHTML = request.details
    .map((d) => `<dt>${escapeHtml(d.label)}</dt><dd>${escapeHtml(d.value)}</dd>`)
    .join("");

  if (request.priceEstimate) {
    const p = request.priceEstimate;
    $("estimate").innerHTML = `<div class="price">${escapeHtml(money(p.low, p.currency))} – ${escapeHtml(money(p.high, p.currency))}</div><p class="muted">${escapeHtml(p.basis)}</p>`;
    $("estimate-card").classList.remove("hidden");
  }

  if (isOwner) renderOwner();
  else renderPublic();
}

function renderBanner(html, cls = "") {
  $("banner").innerHTML = html ? `<div class="banner ${cls}">${html}</div>` : "";
}

function renderOwner() {
  const { request, quotes, analysis } = state;
  $("owner-view").classList.remove("hidden");
  $("public-view").classList.add("hidden");

  if (!request.sample) {
    $("share-card").classList.remove("hidden");
    $("share-link").value = `${location.origin}/r/${encodeURIComponent(request.id)}`;
  }

  const isNew = new URLSearchParams(location.search).get("new") === "1";
  if (request.status === "awarded") {
    const winner = quotes.find((q) => q.id === request.awardedQuoteId);
    renderBanner(
      winner
        ? `🎉 You hired <b>${escapeHtml(winner.businessName)}</b> for ${escapeHtml(money(winner.price, winner.currency))}.${winner.email ? ` Reach them at <a href="mailto:${escapeHtml(winner.email)}">${escapeHtml(winner.email)}</a>.` : ""}`
        : "🎉 You've hired someone for this job.",
    );
  } else if (request.sample) {
    renderBanner("👀 This is a <b>sample request</b>. Try <b>Compare with AI</b> to see how it works, then <a href=\"/\">post your own</a>.", "info");
  } else if (isNew) {
    renderBanner("✅ <b>Your request is live.</b> Businesses can now send quotes. Share your link to get more, and bookmark this page to check back.", "info");
  } else {
    renderBanner("");
  }

  $("quotes-heading").textContent = quotes.length === 1 ? "1 quote" : `${quotes.length} quotes`;
  $("analyze-btn").classList.toggle("hidden", quotes.length < 1);

  const ranking = new Map((analysis?.rankings || []).map((r) => [r.quote_id, r]));
  const fresh = analysis && analysis.signature === quotes.map((q) => q.id).sort().join(",");

  $("analysis").innerHTML = fresh ? analysisCard(analysis) : "";

  if (!quotes.length) {
    $("quotes").innerHTML = `<div class="card empty"><h3>No quotes yet</h3><p>Businesses are being notified. Share your link to speed things up.</p></div>`;
    return;
  }

  $("quotes").innerHTML = quotes
    .map((q) => quoteCard(q, fresh ? ranking.get(q.id) : null, fresh && analysis.best_quote_id === q.id))
    .join("");
}

function analysisCard(a) {
  const flags = a.red_flags.length
    ? `<strong>⚠️ Check before you accept</strong><ul>${a.red_flags.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}</ul>`
    : "";
  return `
    <div class="card analysis">
      <span class="badge brand">${a.source === "ai" ? "✨ AI analysis" : "Quick analysis"}</span>
      <h3 style="margin-top:10px">${escapeHtml(a.headline)}</h3>
      ${flags}
      <p style="margin:0"><strong>💡 Negotiation tip:</strong> ${escapeHtml(a.negotiation_tip)}</p>
    </div>`;
}

function quoteCard(q, rank, best) {
  const { request } = state;
  const list = (items) => items.map((i) => `<li>${escapeHtml(i)}</li>`).join("");
  const meta = [q.timeline && `🗓 ${escapeHtml(q.timeline)}`, q.yearsInBusiness != null && `🏢 ${q.yearsInBusiness} yr${q.yearsInBusiness === 1 ? "" : "s"} in business`]
    .filter(Boolean)
    .join(" · ");
  const canAward = request.status === "open" && !request.sample;
  const hired = request.awardedQuoteId === q.id;
  return `
    <div class="card quote ${best ? "best" : ""}">
      ${best ? '<span class="badge good ribbon">★ Best value</span>' : ""}
      <div class="quote-top">
        <div>
          <h3>${escapeHtml(q.businessName)}</h3>
          <div class="muted" style="font-size:.9rem">${meta || "&nbsp;"}</div>
        </div>
        <div class="price">${escapeHtml(money(q.price, q.currency))}</div>
      </div>
      ${q.includes?.length ? `<ul>${list(q.includes)}</ul>` : ""}
      ${q.message ? `<p class="msg">“${escapeHtml(q.message)}”</p>` : ""}
      ${
        rank
          ? `<div class="proscons">
              <div><span class="pro-title">Pros</span><ul>${list(rank.pros) || "<li>None noted</li>"}</ul></div>
              <div><span class="con-title">Watch out</span><ul>${list(rank.cons) || "<li>None noted</li>"}</ul></div>
            </div>`
          : ""
      }
      <div class="quote-actions">
        <span class="muted" style="font-size:.85rem">${rank ? `Value score <b>${Math.round(rank.score)}</b>/100 · ` : ""}${timeAgo(q.createdAt)}</span>
        ${hired ? '<span class="badge good">Hired</span>' : canAward ? `<button class="btn good small" data-award="${escapeHtml(q.id)}">Accept quote</button>` : ""}
      </div>
    </div>`;
}

function renderPublic() {
  const { request } = state;
  $("owner-view").classList.add("hidden");
  $("public-view").classList.remove("hidden");
  const count = request.quoteCount === 1 ? "1 business has" : `${request.quoteCount} businesses have`;
  if (request.status !== "open") {
    renderBanner("This request has been filled and is no longer accepting quotes.", "info");
    $("quote-form").classList.add("hidden");
  } else {
    renderBanner(`${count} quoted so far. Be specific about what's included to stand out.`, "info");
  }
}

$("analyze-btn").addEventListener("click", async () => {
  const btn = $("analyze-btn");
  $("owner-error").textContent = "";
  setBusy(btn, true, "Comparing…");
  try {
    const { analysis } = await api(`/api/requests/${encodeURIComponent(id)}/analyze`, { method: "POST", body: {}, owner: id });
    state.analysis = analysis;
    renderOwner();
    $("analysis").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    $("owner-error").textContent = err.message;
  } finally {
    setBusy(btn, false);
  }
});

$("quotes").addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-award]");
  if (!btn) return;
  const quote = state.quotes.find((q) => q.id === btn.dataset.award);
  if (!confirm(`Accept ${quote.businessName}'s quote for ${money(quote.price, quote.currency)}? Other businesses will stop quoting.`)) return;
  setBusy(btn, true, "Accepting…");
  try {
    await api(`/api/requests/${encodeURIComponent(id)}/award`, { method: "POST", body: { quoteId: quote.id }, owner: id });
    state = await api(`/api/requests/${encodeURIComponent(id)}`, { owner: id });
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    $("owner-error").textContent = err.message;
    setBusy(btn, false);
  }
});

$("quote-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("quote-btn");
  $("quote-error").textContent = "";
  const form = new FormData(e.target);
  const years = form.get("yearsInBusiness");
  const body = {
    businessName: form.get("businessName"),
    email: form.get("email"),
    price: Number(form.get("price")),
    currency: form.get("currency"),
    timeline: form.get("timeline"),
    message: form.get("message"),
    includes: String(form.get("includes") || "")
      .split(/\n|,/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 10),
  };
  if (years !== "") body.yearsInBusiness = Number(years);
  setBusy(btn, true, "Sending…");
  try {
    await api(`/api/requests/${encodeURIComponent(id)}/quotes`, { method: "POST", body });
    e.target.innerHTML = `<h2>✅ Quote sent</h2><p>The buyer has been notified. If they accept, they'll get your email to finalize the details.</p><a class="btn secondary" href="/providers">Find more customers →</a>`;
  } catch (err) {
    $("quote-error").textContent = err.message;
    setBusy(btn, false);
  }
});

$("copy-btn").addEventListener("click", async () => {
  const input = $("share-link");
  try {
    await navigator.clipboard.writeText(input.value);
  } catch {
    input.select();
    document.execCommand("copy");
  }
  $("copy-btn").textContent = "Copied!";
  setTimeout(() => ($("copy-btn").textContent = "Copy"), 1500);
});

load();
