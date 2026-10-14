# Clutch ⚡ The AI sports app

**Beat the AI at sports.** Clutch puts four games in one free app, with one profile, one coin wallet and one set of leaderboards:

| | |
|---|---|
| 🤖 **Beat the Bot** | Pick the winner of every game. An AI analyst locks in its own picks (with odds and reasoning) before kickoff. Upset bonuses, streaks, a You-vs-Bot scoreboard. |
| 📈 **Prediction market** | Every game gets markets ("Will the home team win?", "Over 44.5?"). Buy and sell YES/NO with play coins; prices move like a real market (LMSR) and pay out at the final whistle. |
| 🎰 **Betting-bot league** | Describe a strategy in one sentence. AI builds the bot, backtests it on the last 30 days, and it bets on every matching game from then on. |
| 📺 **Watch parties** | A live room per game: score, AI play-by-play calls, fan chat, reactions, viewer count. |

Plus **friend leagues** (private standings with an invite link), daily coins, referral bonuses, badges, three leaderboards, rich link previews for every shared game, bot and league, an installable app with offline support, and an iPhone/Android app with push notifications.

> Free to play. Coins can't be bought, sold or cashed out. Clutch is not a sportsbook.

- **Strategy and money:** [BUSINESS_PLAN.md](BUSINESS_PLAN.md)
- **App Store submission:** [app-store/README.md](app-store/README.md)

## Run it

You need [Node.js](https://nodejs.org) 22.9+.

```bash
npm install
npm start
```

Open http://localhost:3000. It starts with sample fans and bots so the leaderboards aren't empty.

- **Real games:** at startup the server tries ESPN's public scoreboards (NFL, NBA, MLB, NHL, Premier League: schedules, scores, records and betting lines). If they're unreachable, it runs the **demo league**: fictional teams, a game every 90 minutes around the clock, labeled "Demo" everywhere. Force either with `SPORTS_DATA=espn` or `SPORTS_DATA=demo`.
- **Real AI:** put an Anthropic API key in `.env` (copy `.env.example`). Without one, a built-in model makes the picks, parses bot descriptions and writes commentary.

> ESPN's endpoints are unofficial. Before a commercial launch, switch to a licensed sports data provider (for example SportsDataIO, Sportradar or The Odds API). Only `src/sports/espn.js` needs to change.

## Put it online

### One click (recommended)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/cotaserch-arch/app)

1. Click the button and sign in to Render with GitHub.
2. Paste your `ANTHROPIC_API_KEY` and `CONTACT_EMAIL` when asked. `ADMIN_TOKEN` is generated for you; find it under the service's **Environment** tab.
3. Click **Apply**. The blueprint (`render.yaml`) sets up the server, a health check and a **1 GB persistent disk** for the database. Disks need a paid instance: the smallest ("starter") is about $7/month.
4. Add your domain under **Settings → Custom Domains**. HTTPS makes the site installable from Chrome and Safari.

### Anywhere else

- **Docker:** `docker build -t clutch . && docker run -p 3000:3000 -v clutch-data:/data -e ANTHROPIC_API_KEY=... clutch`
- **Any Node 22 host:** build `npm ci`, start `npm start`, and set `DATA_FILE` to a path on a persistent disk.

> **Hosts that wipe files on restart** (like Replit's default Autoscale hosting, or Railway without a volume) will reset everyone's coins and picks. Use a persistent disk or volume.

Every push runs the tests and bundles the iPhone app on GitHub Actions (`.github/workflows/ci.yml`).

## Make money with it

| Lever | How to switch it on |
|---|---|
| **Sportsbook affiliate** | Join a sportsbook affiliate program, then set `SPORTSBOOK_NAME` and `SPORTSBOOK_URL`. "Bet it" links appear on game cards and pages, **website only** (never in the phone app), with 21+ and responsible-gambling text. Check each state's affiliate licensing rules first. |
| **Ads** | Set `ADSENSE_CLIENT` and `ADSENSE_SLOT` (website only; `/ads.txt` is generated). Or sell a sponsor directly with `SPONSOR_NAME`, `SPONSOR_TEXT` and `SPONSOR_URL`. |
| **Pro and leagues** | The Pro page collects a waitlist and partner leads now. Add Stripe on the web, and Apple/Google in-app purchase in the phone app, when ready. |
| **Your numbers** | `curl -H "x-admin-token: $ADMIN_TOKEN" https://your-domain/api/admin/stats` shows real fans, picks, bots, trades, waitlist emails and reported chat messages. |

## Phone apps

`mobile/` is an Expo (SDK 57) app that wraps the site, registers for push notifications ("✅ Your pick won!"), opens notification taps on the right game, and sends outside links to the browser. The full App Store and Google Play steps, listing text, screenshots, privacy answers and review notes are in **[app-store/README.md](app-store/README.md)**.

## How it's built

```
src/
  server.js        startup: data source, database, sample data, push sender
  app.js           API routes, validation, rate limits, in-app safety switches
  league.js        fans, coins, picks and grading, markets, bots, watch-party rooms
  sports/          ESPN feed, demo league, team lists, source selection
  ai.js            Claude: game previews, bot builder, commentary (structured outputs)
  offline.js       built-in fallbacks: line-based model, bot parser, commentary templates
  bots.js          betting-bot rules (data, never code) and replay
  lmsr.js          prediction-market pricing
  odds.js          moneyline math
  push.js          Expo push notifications
  badges.js, seed.js, store.js
public/            the web app (plain HTML/CSS/JS, no build step), service worker, icons
mobile/            iPhone/Android app (Expo)
app-store/         screenshots, icon and listing for the App Store
test/              npm test
```

**Fairness rules:**
- The AI's pick only counts if it was locked in **before kickoff**.
- Market trading closes at kickoff.
- A bot's record is a replay of its locked rules over finished games, so it can't be edited after the fact.

### API

| Method | Path | What |
|---|---|---|
| GET | `/api/health` | Health check for hosts |
| GET | `/api/config` | App settings, sports, partner, ads |
| POST | `/api/fans` | Join with `{handle, ref?}` → `{token}` (send it as `x-fan-token`) |
| GET / DELETE | `/api/me` | Profile, recent picks, positions, bots / delete everything |
| POST | `/api/me/daily` | Daily coins |
| POST | `/api/me/push` | Register an Expo push token |
| GET | `/api/games?date=&tz=&sport=` | Games for a local day, with the AI's pick and your pick |
| GET | `/api/games/:id` | Game, AI preview, markets |
| POST | `/api/games/:id/pick` | `{side: "home" \| "away"}` |
| POST | `/api/markets/:id/trade` | `{action: buy \| sell, outcome: yes \| no, coins \| shares}` |
| GET | `/api/games/:id/room?since=` | Watch party: new messages, reactions, viewers |
| POST | `/api/games/:id/chat` · `/react` · `/report` | Chat, react, report a message |
| POST | `/api/bots/compile` · `/api/bots/backtest` · `/api/bots` | Build, test and enter a bot |
| GET | `/api/bots/:id` | Bot profile |
| GET | `/api/leaderboard?board=pickers\|traders\|bots` | Standings |
| POST | `/api/groups` · `/api/groups/:id/join` · `/leave` | Create, join or leave a friend league |
| GET | `/api/groups/:id` | Friend-league standings (picks after each member joined) |
| POST | `/api/waitlist` | Pro, partner and sponsor leads |

## Tests

```bash
npm test
```

Covers odds and market math, bot betting, the parser, commentary, demo-league consistency, ESPN parsing, picks and grading, market settlement, referrals, chat moderation, account deletion, push notifications, in-app safety switches and the full API.

## Earlier ideas

The git history has two earlier prototypes from this project: **CotaSearch** (an AI quote marketplace, commit `b32e0ff`) and **Botfolio** (an AI crypto-bot league, commit `3d9ec9c`).
