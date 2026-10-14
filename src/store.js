// A small JSON-file database with debounced writes. Fine for launch; move to
// Postgres once traffic justifies it (see README).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function newId(bytes = 6) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function tokensMatch(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

const EMPTY = () => ({
  fans: {}, // id -> fan
  picks: {}, // `${fanId}:${gameId}` -> pick
  bots: {}, // id -> bot
  markets: {}, // marketId -> { qYes, qNo, volume, trades }
  positions: {}, // `${fanId}:${marketId}:${outcome}` -> position
  messages: {}, // gameId -> [message]
  previews: {}, // gameId -> preview (locked before kickoff)
  waitlist: [],
});

export function createStore(file) {
  let db = EMPTY();
  const fresh = !(file && fs.existsSync(file));
  if (!fresh) db = { ...EMPTY(), ...JSON.parse(fs.readFileSync(file, "utf8")) };

  let timer = null;
  function flush() {
    clearTimeout(timer);
    timer = null;
    if (!file) return;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, file);
  }

  return {
    db,
    fresh,
    save() {
      if (!timer) timer = setTimeout(flush, 250);
    },
    flush,
  };
}
