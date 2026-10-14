# Botfolio 🤖

**Build an AI trader in one sentence. Battle the world.**

Botfolio is a fantasy league for AI trading bots. You describe a crypto strategy in plain English. AI turns it into a bot, tests it on a year of prices, grades it, and enters it in a live league where it trades $10,000 of paper money against everyone else's bots.

> Paper trading only. No real money moves, and nothing in the app is financial advice.

See [BUSINESS_PLAN.md](BUSINESS_PLAN.md) for the strategy and how it makes money.

## Features

| | |
|---|---|
| ⚡ **AI strategy builder** | "Buy Solana when RSI is under 30, sell at +20%" becomes precise, readable rules |
| 📊 **Instant backtest** | One year of daily prices, compared against just holding Bitcoin |
| 🎓 **AI Coach** | Grades every bot A–F, with strengths, weaknesses and what to try next |
| 🏆 **Live league** | Bots trade from the day they join. Rules lock on entry, so nobody can cheat with hindsight |
| ⚔️ **Bot Battles** | Pit any two bots head to head over 30 days, 90 days or a year |
| 🏅 **Achievements** | Bitcoin Beater, Sniper, Iron Stomach, Moonshot, Whale, Diamond Hands and more |
| 🔥 **Hype & Trending** | One hype per visitor per bot per day, with a Trending leaderboard |
| 🧬 **Clone** | Copy any bot's exact rules, rename it, and enter your own version |
| 🔗 **Share** | Share cards for bots and battles (native share sheet on phones) |
| 📈 **Live ticker** | 10 coins with 24h moves |
| 📱 **Installable app** | Works offline-first and installs from Chrome, Edge or Safari ("Add to Home Screen") |
| 💰 **Monetization** | Ad slots (Google AdSense or direct sponsors), Pro/Whale waitlist, sponsor inquiries, admin stats |

## Run it

You need [Node.js](https://nodejs.org) 22.9+.

```bash
npm install
npm start
```

Open http://localhost:3000. A fresh install comes with 8 **sample** bots so the league isn't empty.

**Turn on the real AI:** copy `.env.example` to `.env`, paste an Anthropic API key into `ANTHROPIC_API_KEY`, and restart. Without a key, a built-in rule-based parser and coach run instead ("Demo AI").

**Prices:** the server pulls daily candles for BTC, ETH, SOL, XRP, DOGE, ADA, AVAX, LINK, LTC and DOT from Coinbase's free public API every 30 minutes. If it can't reach Coinbase, it switches to a **simulated market** and labels it clearly everywhere in the app.

## Put it on the internet

Any Node host works. With [Render](https://render.com) or [Railway](https://railway.app):

1. Connect this GitHub repo.
2. Build command `npm install`, start command `npm start`.
3. Add environment variables: `ANTHROPIC_API_KEY` and `ADMIN_TOKEN` (any long random string).
4. **Attach a persistent disk** and set `DATA_FILE=/data/db.json`. Without one, bots are wiped on every deploy.
5. Add your domain.

Once it's live on HTTPS, the app is installable straight from the browser.

## Make money with it

- **Ads:** apply for [Google AdSense](https://adsense.google.com) once the site is live, then set `ADSENSE_CLIENT` (e.g. `ca-pub-123…`) and `ADSENSE_SLOT`. Every ad slot switches to real ads, and `/ads.txt` is generated for you.
- **Direct sponsors** (usually pay more than ad networks): set `SPONSOR_NAME`, `SPONSOR_TEXT` and `SPONSOR_URL` to put a sponsor in every slot.
- **Pro waitlist & sponsor leads:** signups from the Pro page are stored. To see them:
  ```bash
  curl -H "x-admin-token: $ADMIN_TOKEN" https://your-domain/api/admin/stats
  ```
- **Payments:** Pro is a waitlist today. When enough people sign up, add Stripe Checkout for the $9 and $29 plans.

## Getting into the app stores

The app is already a Progressive Web App, which is the starting point for both stores. Each store needs an account in **your** name; nobody can open one for you.

- **Google Play** (one-time $25 developer fee): wrap the live site with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) (a Trusted Web Activity). Run `npx @bubblewrap/cli init --manifest https://your-domain/manifest.webmanifest`, build, and upload the `.aab` in the Play Console.
- **Apple App Store** ($99/year Apple Developer Program, plus a Mac with Xcode): wrap the site with [Capacitor](https://capacitorjs.com), build in Xcode, and upload through **App Store Connect**. Apple rejects apps that are just a website in a box (guideline 4.2), so add native extras first, like push notifications for bot trades and a home-screen widget showing your bot's rank.
- **Chrome Web Store** isn't needed. Chrome installs the PWA directly with the "Install app" button.

## How it works

```
src/
  server.js     starts everything
  app.js        API routes, validation, rate limits, league ranking, battles
  strategy.js   the strategy format (data, never code) + safety clamps + templates
  engine.js     paper-trading engine and indicators (deterministic)
  market.js     Coinbase prices, simulated market fallback, ticker
  ai.js         Claude: plain English → strategy, and the AI coach (structured outputs)
  offline.js    rule-based parser and coach (demo mode + backup)
  badges.js     achievements
  seed.js       sample bots
  store.js      JSON-file database
public/         the app (plain HTML/CSS/JS, no build step), service worker, manifest, icons
test/           npm test
```

**Why strategies are safe:** the AI never writes code. It fills in a strict schema (`strategy.js`): which coins, which of six indicators, thresholds, position size, stop loss and take profit. Every strategy, from the AI or a browser, is validated and clamped before the engine runs it.

**Why the league is fair:** a bot is scored only on prices *after* it joined, and its rules can't change. Backtests are shown, but never ranked.

### API

| Method | Path | What |
|---|---|---|
| GET | `/api/config` | AI mode, price source, coins, templates, ad config |
| GET | `/api/market` | Ticker |
| POST | `/api/strategies/compile` | `{text}` → strategy (AI) |
| POST | `/api/strategies/backtest` | `{strategy, days?}` → rules, curve, stats, trades |
| POST | `/api/strategies/coach` | `{strategy}` → grade + feedback (AI) |
| POST | `/api/bots` | Enter the league `{name, creator, prompt, strategy, clonedFrom?}` |
| GET | `/api/bots/:id` | Bot profile, live results, backtest, badges |
| POST | `/api/bots/:id/hype` | 🔥 |
| GET | `/api/leaderboard` | `?sort=return\|trending\|new` |
| GET | `/api/battle` | `?a=&b=&days=30\|90\|365` |
| POST | `/api/waitlist` | `{email, plan}` |
| GET | `/api/admin/stats` | Needs `x-admin-token` |

## Tests

```bash
npm test
```

Covers the engine math, indicators, the parser on every template, Coinbase response parsing, the simulated-market fallback, and the full API flow.

## Roadmap

1. Accounts (sign in with Google or Apple) so bots follow you across devices
2. Push alerts when your bot trades or gets passed on the leaderboard
3. Stripe payments for Pro and Whale
4. Private leagues and weekly seasons with sponsor prizes
5. Stocks and ETFs alongside crypto
6. Strategy marketplace: top creators sell their bots' rules
7. Postgres, once there are more than a few thousand bots

*Earlier idea:* the CotaSearch quote marketplace prototype lives in git history (commit `b32e0ff`).
