# CotaSearch

**Get quotes for anything.** Describe what you need in plain words. Businesses compete with quotes, and AI tells you which one is the best deal.

- **Buyers** type something like *"move my 2-bedroom from Austin to Dallas next Saturday"*. AI turns it into a clear request, flags what's missing, and estimates the typical price.
- **Businesses** browse open requests and send a quote in about 60 seconds.
- **AI compares the quotes** on price, experience and scope, flags red flags, and suggests how to negotiate. The buyer accepts with one tap and gets the business's contact details.

See [BUSINESS_PLAN.md](BUSINESS_PLAN.md) for the strategy, revenue model and launch plan.

## Run it on your computer

You need [Node.js](https://nodejs.org) 22.9 or newer.

```bash
npm install
npm start
```

Open http://localhost:3000. It starts with a few **sample** requests so you can try everything right away.

### Turn on the real AI

Without an API key, CotaSearch runs in **demo mode** with a simpler built-in parser and quote ranking. To turn on Claude:

1. Get an API key at https://console.anthropic.com
2. Copy `.env.example` to `.env` and paste the key into `ANTHROPIC_API_KEY=`
3. Restart with `npm start`. The home page will say **"AI on"**.

Each AI call costs a few cents. The server limits each visitor to 30 AI calls per 10 minutes to keep costs under control, and falls back to the built-in logic if an AI call fails.

## Put it on the internet

Any Node host works. For example, on [Render](https://render.com) or [Railway](https://railway.app):

1. Connect this GitHub repository.
2. Build command: `npm install`. Start command: `npm start`.
3. Add the environment variable `ANTHROPIC_API_KEY`.
4. **Attach a persistent disk** and set `DATA_FILE` to a path on it (for example `/data/db.json`). Without one, requests are wiped on every redeploy.
5. Set `SEED_SAMPLES=false` once you have real requests.

## Settings

| Variable | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | *(empty)* | Turns on AI. Empty means demo mode. |
| `PORT` | `3000` | Port the web server listens on. |
| `DATA_FILE` | `data/db.json` | Where requests and quotes are saved. |
| `SEED_SAMPLES` | `true` | Adds sample requests when starting with an empty database. |

## How the code is organized

```
src/
  server.js      starts the web server
  app.js         API routes, validation, permissions, rate limits
  ai.js          Claude calls (structured outputs) with automatic fallback
  heuristics.js  offline request parser + quote ranking (demo mode and backup)
  store.js       JSON-file database
  seed.js        sample requests shown on a fresh install
  categories.js  request categories
public/          the website (plain HTML/CSS/JS, no build step)
test/            automated tests (npm test)
```

### How buyers and businesses are kept apart

There are no accounts yet. When a buyer posts a request, the server returns a private **owner token** that the browser saves. Only that browser can see the quotes, run the AI comparison and accept a quote. Businesses never see each other's prices, and a business's email is revealed only to the buyer who accepts its quote.

### API

| Method | Path | Who | What |
|---|---|---|---|
| `GET` | `/api/config` | anyone | AI mode and categories |
| `POST` | `/api/requests/draft` | anyone | Turn plain text into a structured draft |
| `POST` | `/api/requests` | anyone | Post a request; returns `id` and `ownerToken` |
| `GET` | `/api/requests` | anyone | List open requests (`?category=`, `?q=`) |
| `GET` | `/api/requests/:id` | anyone / owner | Request details; owner also gets quotes |
| `POST` | `/api/requests/:id/quotes` | businesses | Send a quote |
| `POST` | `/api/requests/:id/analyze` | owner | AI comparison of the quotes |
| `POST` | `/api/requests/:id/award` | owner | Accept a quote and get the business's contact |

The owner sends their token in the `x-owner-token` header.

## Tests

```bash
npm test
```

## What to build next

1. **Email notifications.** Tell businesses about new requests in their category, and tell buyers when a quote arrives.
2. **Business accounts and payments.** Add Stripe so businesses buy quote credits (the revenue model).
3. **AI outreach agent.** Contact businesses that aren't on CotaSearch yet to get quotes for the buyer. This solves the empty-marketplace problem.
4. **Reviews** after a job is done.
5. **Move to Postgres** once you're past a few thousand requests.
