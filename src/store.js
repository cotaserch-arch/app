// A small JSON-file database. Fine for launch and the first few thousand
// requests; swap for Postgres once traffic justifies it (see README).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { sampleData } from "./seed.js";

export function newId(bytes = 6) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function tokensMatch(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function createStore(file, { seed = true } = {}) {
  let db;
  if (file && fs.existsSync(file)) {
    db = JSON.parse(fs.readFileSync(file, "utf8"));
  } else {
    db = seed ? sampleData() : { requests: [], quotes: [] };
    persist();
  }

  function persist() {
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, file);
  }

  return {
    listRequests({ status, category, q } = {}) {
      const needle = q?.toLowerCase();
      return db.requests
        .filter((r) => !status || r.status === status)
        .filter((r) => !category || r.category === category)
        .filter((r) => !needle || `${r.title} ${r.summary} ${r.location}`.toLowerCase().includes(needle))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    getRequest(id) {
      return db.requests.find((r) => r.id === id) || null;
    },
    createRequest(fields) {
      const request = {
        id: newId(),
        ownerToken: newId(24),
        createdAt: new Date().toISOString(),
        status: "open",
        sample: false,
        awardedQuoteId: null,
        analysis: null,
        ...fields,
      };
      db.requests.push(request);
      persist();
      return request;
    },
    updateRequest(id, changes) {
      const request = this.getRequest(id);
      if (!request) return null;
      Object.assign(request, changes);
      persist();
      return request;
    },
    quotesFor(requestId) {
      return db.quotes.filter((q) => q.requestId === requestId).sort((a, b) => a.price - b.price);
    },
    quoteCount(requestId) {
      return db.quotes.reduce((n, q) => n + (q.requestId === requestId ? 1 : 0), 0);
    },
    createQuote(fields) {
      const quote = { id: newId(), createdAt: new Date().toISOString(), sample: false, ...fields };
      db.quotes.push(quote);
      persist();
      return quote;
    },
  };
}
