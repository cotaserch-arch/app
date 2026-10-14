import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { z } from "zod";
import * as defaultAi from "./ai.js";
import { CATEGORIES } from "./categories.js";
import { newId, tokensMatch } from "./store.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, "..", "public");

const DraftInput = z.object({ text: z.string().trim().min(10, "Tell us a bit more (at least 10 characters).").max(2000) });

const CreateInput = z.object({
  draftId: z.string().max(40).optional(),
  text: z.string().trim().min(10).max(2000),
  title: z.string().trim().min(3).max(120),
  category: z.enum(CATEGORIES),
  summary: z.string().trim().max(1000).default(""),
  location: z.string().trim().max(120).default(""),
  timeline: z.string().trim().max(120).default(""),
  budget: z.string().trim().max(60).default(""),
  details: z.array(z.object({ label: z.string().trim().max(60), value: z.string().trim().max(200) })).max(12).default([]),
  contactName: z.string().trim().max(60).default(""),
});

const QuoteInput = z.object({
  businessName: z.string().trim().min(2, "Business name is required.").max(80),
  email: z.string().trim().email("Enter a valid email so the buyer can reach you.").max(120),
  price: z.coerce.number().positive("Price must be more than 0.").max(100_000_000),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default("USD"),
  timeline: z.string().trim().max(80).default(""),
  yearsInBusiness: z.coerce.number().int().min(0).max(200).optional(),
  includes: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
  message: z.string().trim().max(1500).default(""),
});

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function parse(schema, body) {
  const result = schema.safeParse(body ?? {});
  if (!result.success) throw new HttpError(400, result.error.issues[0]?.message || "Invalid input.");
  return result.data;
}

// Per-IP sliding window, to keep AI spend and spam under control.
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const recent = (hits.get(req.ip) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      return res.status(429).json({ error: "Too many requests. Please wait a few minutes and try again." });
    }
    recent.push(now);
    hits.set(req.ip, recent);
    if (hits.size > 10_000) hits.clear();
    next();
  };
}

export function createApp({ store, ai = defaultAi, limits = {} }) {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));

  // Drafts live briefly server-side so the AI price estimate can't be forged by the client.
  const drafts = new Map();
  const aiLimit = rateLimit({ windowMs: 10 * 60_000, max: limits.ai ?? 30 });
  const writeLimit = rateLimit({ windowMs: 10 * 60_000, max: limits.write ?? 40 });

  const isOwner = (req, request) => tokensMatch(req.get("x-owner-token"), request.ownerToken);

  function publicRequest(request) {
    // The price estimate stays with the buyer so it doesn't anchor what businesses quote.
    const { ownerToken, analysis, rawText, priceEstimate, ...rest } = request;
    return { ...rest, quoteCount: store.quoteCount(request.id) };
  }

  function loadRequest(id) {
    const request = store.getRequest(id);
    if (!request) throw new HttpError(404, "Request not found.");
    return request;
  }

  app.get("/api/config", (req, res) => {
    res.json({ aiMode: ai.aiMode(), categories: CATEGORIES });
  });

  app.post("/api/requests/draft", aiLimit, async (req, res) => {
    const { text } = parse(DraftInput, req.body);
    const { draft, source } = await ai.draftRequest(text);
    const draftId = newId();
    drafts.set(draftId, { priceEstimate: draft.price_estimate, at: Date.now() });
    if (drafts.size > 2000) drafts.delete(drafts.keys().next().value);
    res.json({ draftId, draft, source });
  });

  app.post("/api/requests", writeLimit, (req, res) => {
    const input = parse(CreateInput, req.body);
    const cached = input.draftId && drafts.get(input.draftId);
    if (cached) drafts.delete(input.draftId);
    const { draftId, text, ...fields } = input;
    const request = store.createRequest({
      ...fields,
      rawText: text,
      priceEstimate: cached && Date.now() - cached.at < 3_600_000 ? cached.priceEstimate : null,
    });
    res.status(201).json({ id: request.id, ownerToken: request.ownerToken });
  });

  app.get("/api/requests", (req, res) => {
    const status = req.query.status === "all" ? undefined : "open";
    const category = CATEGORIES.includes(req.query.category) ? req.query.category : undefined;
    const q = typeof req.query.q === "string" ? req.query.q.slice(0, 100) : undefined;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const requests = store.listRequests({ status, category, q }).slice(0, limit).map(publicRequest);
    res.json({ requests });
  });

  app.get("/api/requests/:id", (req, res) => {
    const request = loadRequest(req.params.id);
    const owner = isOwner(req, request) || request.sample;
    const body = { request: publicRequest(request), isOwner: owner };
    if (owner) {
      body.request.priceEstimate = request.priceEstimate;
      body.quotes = store.quotesFor(request.id).map(({ email, ...q }) =>
        // Contact details unlock once the buyer accepts a quote.
        request.awardedQuoteId === q.id ? { ...q, email } : q,
      );
      body.analysis = request.analysis;
    }
    res.json(body);
  });

  app.post("/api/requests/:id/quotes", writeLimit, (req, res) => {
    const request = loadRequest(req.params.id);
    if (request.status !== "open") throw new HttpError(409, "This request is no longer accepting quotes.");
    if (isOwner(req, request)) throw new HttpError(403, "You can't quote your own request.");
    const input = parse(QuoteInput, req.body);
    const quote = store.createQuote({ requestId: request.id, ...input });
    res.status(201).json({ id: quote.id });
  });

  app.post("/api/requests/:id/analyze", aiLimit, async (req, res) => {
    const request = loadRequest(req.params.id);
    if (!isOwner(req, request) && !request.sample) throw new HttpError(403, "Only the buyer can compare quotes.");
    const quotes = store.quotesFor(request.id);
    if (!quotes.length) throw new HttpError(409, "No quotes to compare yet.");
    const signature = quotes.map((q) => q.id).sort().join(",");
    if (request.analysis?.signature === signature) return res.json({ analysis: request.analysis });
    const result = await ai.compareQuotes(request, quotes);
    const analysis = { ...result, signature, createdAt: new Date().toISOString() };
    store.updateRequest(request.id, { analysis });
    res.json({ analysis });
  });

  app.post("/api/requests/:id/award", writeLimit, (req, res) => {
    const request = loadRequest(req.params.id);
    if (request.sample) throw new HttpError(403, "This is a sample request. Post your own to hire someone.");
    if (!isOwner(req, request)) throw new HttpError(403, "Only the buyer can accept a quote.");
    if (request.status !== "open") throw new HttpError(409, "A quote has already been accepted.");
    const quoteId = typeof req.body?.quoteId === "string" ? req.body.quoteId : "";
    const quote = store.quotesFor(request.id).find((q) => q.id === quoteId);
    if (!quote) throw new HttpError(404, "Quote not found.");
    store.updateRequest(request.id, { status: "awarded", awardedQuoteId: quote.id });
    res.json({ ok: true, contact: { businessName: quote.businessName, email: quote.email } });
  });

  app.use("/api", (req, res) => res.status(404).json({ error: "Not found." }));

  app.get("/r/:id", (req, res) => res.sendFile(path.join(publicDir, "request.html")));
  app.use(express.static(publicDir, { extensions: ["html"] }));

  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err.type === "entity.parse.failed") return res.status(400).json({ error: "Invalid JSON." });
    if (err.type === "entity.too.large") return res.status(413).json({ error: "Request is too large." });
    console.error(err);
    res.status(500).json({ error: "Something went wrong. Please try again." });
  });

  return app;
}
