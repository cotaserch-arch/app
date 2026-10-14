import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createApp } from "../src/app.js";
import { compareQuotesOffline, draftRequestOffline } from "../src/heuristics.js";
import { createStore } from "../src/store.js";

// Deterministic stand-in for the Claude calls.
const fakeAi = {
  aiMode: () => "demo",
  draftRequest: async (text) => ({
    draft: { ...draftRequestOffline(text), price_estimate: { low: 100, high: 200, currency: "USD", basis: "test" } },
    source: "demo",
  }),
  compareQuotes: async (request, quotes) => ({ ...compareQuotesOffline(request, quotes), source: "demo" }),
};

let server;
let base;

before(async () => {
  const app = createApp({ store: createStore(null, { seed: true }), ai: fakeAi, limits: { ai: 1000, write: 1000 } });
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

async function call(path, { method = "GET", body, token } = {}) {
  const headers = { "content-type": "application/json" };
  if (token) headers["x-owner-token"] = token;
  const res = await fetch(base + path, { method, headers, body: body && JSON.stringify(body) });
  return { status: res.status, data: await res.json() };
}

test("full flow: draft, post, quote, compare, award", async () => {
  const text = "Need my roof leak fixed in Denver this week, water coming into the kitchen.";
  const draftRes = await call("/api/requests/draft", { method: "POST", body: { text } });
  assert.equal(draftRes.status, 200);
  const { draftId, draft } = draftRes.data;
  assert.equal(draft.category, "Home services");

  const created = await call("/api/requests", {
    method: "POST",
    body: { draftId, text, ...draft, price_estimate: { low: 1, high: 2, currency: "USD", basis: "forged" } },
  });
  assert.equal(created.status, 201);
  const { id, ownerToken } = created.data;

  // The public sees the request but not the owner token, quotes, or price estimate.
  const publicView = await call(`/api/requests/${id}`);
  assert.equal(publicView.data.isOwner, false);
  assert.equal(publicView.data.request.ownerToken, undefined);
  assert.equal(publicView.data.request.priceEstimate, undefined);
  assert.equal(publicView.data.quotes, undefined);

  // The owner sees the estimate from the server-side draft, not the forged one.
  const ownerView = await call(`/api/requests/${id}`, { token: ownerToken });
  assert.equal(ownerView.data.isOwner, true);
  assert.equal(ownerView.data.request.priceEstimate.basis, "test");

  const q1 = await call(`/api/requests/${id}/quotes`, {
    method: "POST",
    body: { businessName: "Peak Roofing", email: "peak@example.com", price: 650, yearsInBusiness: 11, includes: ["Inspection", "Patch", "Warranty"] },
  });
  assert.equal(q1.status, 201);
  const q2 = await call(`/api/requests/${id}/quotes`, {
    method: "POST",
    body: { businessName: "Budget Roofs", email: "budget@example.com", price: "480" },
  });
  assert.equal(q2.status, 201);

  const ownQuote = await call(`/api/requests/${id}/quotes`, {
    method: "POST",
    token: ownerToken,
    body: { businessName: "Me", email: "me@example.com", price: 1 },
  });
  assert.equal(ownQuote.status, 403);

  const strangerAnalyze = await call(`/api/requests/${id}/analyze`, { method: "POST", body: {} });
  assert.equal(strangerAnalyze.status, 403);

  const analysis = await call(`/api/requests/${id}/analyze`, { method: "POST", body: {}, token: ownerToken });
  assert.equal(analysis.status, 200);
  assert.equal(analysis.data.analysis.rankings.length, 2);

  const withQuotes = await call(`/api/requests/${id}`, { token: ownerToken });
  assert.equal(withQuotes.data.quotes.length, 2);
  assert.equal(withQuotes.data.quotes[0].price, 480, "quotes sorted cheapest first");
  assert.ok(withQuotes.data.quotes.every((q) => q.email === undefined), "emails hidden before award");

  const strangerAward = await call(`/api/requests/${id}/award`, { method: "POST", body: { quoteId: q1.data.id } });
  assert.equal(strangerAward.status, 403);

  const award = await call(`/api/requests/${id}/award`, { method: "POST", body: { quoteId: q1.data.id }, token: ownerToken });
  assert.equal(award.status, 200);
  assert.equal(award.data.contact.email, "peak@example.com");

  const lateQuote = await call(`/api/requests/${id}/quotes`, {
    method: "POST",
    body: { businessName: "Late Co", email: "late@example.com", price: 300 },
  });
  assert.equal(lateQuote.status, 409);

  const open = await call("/api/requests");
  assert.ok(!open.data.requests.some((r) => r.id === id), "awarded requests leave the open feed");
});

test("validates input", async () => {
  const short = await call("/api/requests/draft", { method: "POST", body: { text: "hi" } });
  assert.equal(short.status, 400);

  const { data } = await call("/api/requests");
  const sample = data.requests.find((r) => r.sample);
  const badQuote = await call(`/api/requests/${sample.id}/quotes`, {
    method: "POST",
    body: { businessName: "X Co", email: "not-an-email", price: 10 },
  });
  assert.equal(badQuote.status, 400);
  assert.match(badQuote.data.error, /email/i);

  const missing = await call("/api/requests/does-not-exist");
  assert.equal(missing.status, 404);
});

test("sample requests can be explored but not awarded", async () => {
  const { data } = await call("/api/requests?category=Moving%20%26%20storage");
  const sample = data.requests.find((r) => r.sample && r.quoteCount > 0);
  const view = await call(`/api/requests/${sample.id}`);
  assert.equal(view.data.isOwner, true);
  const analysis = await call(`/api/requests/${sample.id}/analyze`, { method: "POST", body: {} });
  assert.equal(analysis.status, 200);
  const award = await call(`/api/requests/${sample.id}/award`, { method: "POST", body: { quoteId: view.data.quotes[0].id } });
  assert.equal(award.status, 403);
});

test("serves the web pages", async () => {
  for (const path of ["/", "/providers", "/r/anything"]) {
    const res = await fetch(base + path);
    assert.equal(res.status, 200, path);
    assert.match(res.headers.get("content-type"), /html/);
  }
});
