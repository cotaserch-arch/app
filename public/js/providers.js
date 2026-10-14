import { api, escapeHtml, requestCard } from "./common.js";

const list = document.getElementById("list");
const search = document.getElementById("search");
const category = document.getElementById("category");

api("/api/config")
  .then(({ categories }) => {
    category.insertAdjacentHTML(
      "beforeend",
      categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join(""),
    );
  })
  .catch(() => {});

let timer;
let seq = 0;

async function load() {
  const mine = ++seq;
  const params = new URLSearchParams({ limit: "100" });
  if (search.value.trim()) params.set("q", search.value.trim());
  if (category.value) params.set("category", category.value);
  try {
    const { requests } = await api(`/api/requests?${params}`);
    if (mine !== seq) return;
    list.innerHTML = requests.length
      ? requests.map((r) => requestCard(r, { cta: "Send quote" })).join("")
      : '<div class="card empty" style="grid-column:1/-1">No open requests match. Check back soon. New ones arrive all the time.</div>';
  } catch {
    if (mine === seq) list.innerHTML = '<p class="muted">Couldn\'t load requests right now.</p>';
  }
}

search.addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(load, 250);
});
category.addEventListener("change", load);

load();
