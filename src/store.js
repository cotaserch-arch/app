// A small JSON-file database. Fine for launch and the first few thousand bots;
// move to Postgres once traffic justifies it (see README).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function newId(bytes = 6) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function createStore(file, { seed } = {}) {
  let db;
  if (file && fs.existsSync(file)) {
    db = JSON.parse(fs.readFileSync(file, "utf8"));
  } else {
    db = { bots: seed ? seed() : [], waitlist: [] };
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
    bots: () => db.bots,
    getBot: (id) => db.bots.find((b) => b.id === id) || null,
    createBot(fields) {
      const bot = { id: newId(), createdAt: new Date().toISOString(), sample: false, hype: 0, clones: 0, ...fields };
      db.bots.push(bot);
      persist();
      return bot;
    },
    updateBot(id, changes) {
      const bot = db.bots.find((b) => b.id === id);
      if (!bot) return null;
      Object.assign(bot, typeof changes === "function" ? changes(bot) : changes);
      persist();
      return bot;
    },
    addToWaitlist(entry) {
      const existing = db.waitlist.find((w) => w.email === entry.email);
      if (existing) Object.assign(existing, entry);
      else db.waitlist.push({ ...entry, createdAt: new Date().toISOString() });
      persist();
    },
    waitlist: () => db.waitlist,
  };
}
