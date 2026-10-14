# Clutch: App Store submission kit

Everything Apple asks for, ready to paste. The iPhone app lives in [`../mobile`](../mobile). It's a native shell around the Clutch website, with push notifications.

## What only you can do

These need your identity or payment, so nobody can do them for you:

1. **Apple Developer Program**: enroll at https://developer.apple.com/programs/ ($99/year). Approval can take a day or two.
2. **Expo account** (free): sign up at https://expo.dev. Expo builds the iPhone app in the cloud, so **you don't need a Mac**.
3. **Put the website online first.** The app loads it (see the main README). You'll need its HTTPS address.

> **Shortcut:** connect the **Expo** connector in claude.ai (Settings → Connectors) and ask Claude to run the build and submission steps below for you.

## Step by step (about 30 minutes plus Apple's review)

1. **Set your details** in `mobile/app.json`:
   - `extra.appUrl`: your live site, e.g. `https://clutchsports.app`
   - `ios.bundleIdentifier` and `android.package`: a unique ID you own, e.g. `com.yourname.clutch`
2. **Install and link the project**:
   ```bash
   cd mobile
   npm install
   npx eas-cli login
   npx eas-cli init          # links the project and fills in the EAS project id
   ```
3. **Build for iPhone** in Expo's cloud. When asked, sign in with your Apple ID and let Expo create the certificates:
   ```bash
   npm run build:ios
   ```
4. **Upload to App Store Connect**. This creates the app record if needed:
   ```bash
   npm run submit:ios
   ```
5. **Fill in the listing** at https://appstoreconnect.apple.com: open **My Apps → Clutch** and paste in everything below.
6. **Submit for review.** Apple usually replies within 1–3 days.

Android works the same way: `npm run build:android`, then `npm run submit:android`. That needs a Google Play developer account ($25, one-time).

## The listing

| Field | Value |
|---|---|
| **App name** (≤30) | Clutch: Beat the AI at Sports |
| **Subtitle** (≤30) | Daily sports picks vs the AI |
| **Primary category** | Sports |
| **Secondary category** | Entertainment |
| **Keywords** (≤100) | `sports,picks,predictions,football,basketball,baseball,hockey,soccer,ai,fantasy,pickem,scores,live` |
| **Promotional text** (≤170) | Season 1 is live! Pick today's games, beat the AI analyst, trade predictions with fans, build a betting bot and watch every game together. Free to play. |
| **Support URL** | `https://YOUR-DOMAIN/pro` (or any page with your contact email) |
| **Marketing URL** | `https://YOUR-DOMAIN` |
| **Privacy Policy URL** | `https://YOUR-DOMAIN/privacy` (set `CONTACT_EMAIL` on the server first) |
| **Price** | Free |
| **Screenshots (6.9"/6.7" iPhone)** | `screenshots/1-today.png` … `6-leaders.png` (1290 × 2796) |
| **App icon** | Comes from the build (`mobile/assets/icon.png`). A 1024 × 1024 copy is in `icon-1024.png` |

### Description

```
Think you know sports better than AI? Prove it.

Clutch is the free sports app where you go head to head with an AI analyst every single day.

BEAT THE BOT
Pick the winner of every game across football, basketball, baseball, hockey and soccer. The AI locks in its own picks before kickoff, with its odds and reasoning, so everyone can see who's really smarter. Call an upset for bonus points and build your streak.

TRADE YOUR CALLS
A fan prediction market for every game. Buy YES or NO on who wins or whether the total goes over, and watch prices move as fans pile in. Free play coins only.

BUILD A BETTING BOT
Describe a strategy in one sentence, like "bet every home underdog in hockey", and AI turns it into a bot, tests it on the last 30 days of games and enters it in the bot league.

WATCH TOGETHER
Every game has a live room with real-time scores, AI play-by-play calls, fan chat and reactions.

CLIMB THE LEADERBOARD
Earn badges like Bot Slayer, Oracle and Upset Caller, claim daily coins, and invite friends for bonus coins.

Free to play. Coins have no cash value and can't be bought, sold or redeemed. Clutch is not a sportsbook and doesn't accept wagers.
```

### What's New (version 1.0)

```
Season 1 kicks off! Beat the AI, trade predictions, build betting bots and join live watch parties.
```

## App Review information

**Sign-in required:** No. Users pick a handle in the app; there's no password.

**Notes for the reviewer** (paste as-is):

```
Clutch is a free-to-play sports prediction game. Coins are play money: they cannot be purchased, sold, transferred or redeemed, and there are no cash prizes. The app does not accept wagers and shows no sportsbook links or gambling advertising.

To try it: tap any team on the Today screen to make a pick and choose a handle (no email or password). Open a game for the AI preview, the prediction market and the live watch party. The Bots tab builds a strategy bot from a sentence.

User-generated content: watch-party chat has a profanity filter, every message has Report and Block, and messages reported by 3 users are hidden automatically. Account deletion: Profile (coin balance, top right) → Delete my profile.
```

## Age rating questionnaire

Answer honestly. These are the answers that match the app as built:

| Question | Answer |
|---|---|
| Simulated gambling | **Frequent/Intense** (picks, prediction markets and betting bots use play coins) |
| Real-money gambling / contests | **No** |
| User-generated content | **Yes** (chat, with reporting and blocking) |
| Unrestricted web access | **No** |
| Everything else (violence, mature themes, etc.) | None |

Expect an **18+** rating because of simulated gambling. That's normal for this kind of app.

## App Privacy ("nutrition label")

**Does the app collect data?** Yes.

| Data type | Collected | Linked to the user | Used for tracking | Purpose |
|---|---|---|---|---|
| User ID (handle, fan code) | Yes | Yes | No | App functionality |
| Other user content (chat messages, bot descriptions) | Yes | Yes | No | App functionality |
| Email address (only if they join the Pro waitlist) | Yes | Yes | No | Developer communications |
| Device ID (push notification token) | Yes | Yes | No | App functionality |

**Tracking:** No. The app has no ad tracking or third-party analytics.

## Why the app is built to pass review

| Apple guideline | How Clutch handles it |
|---|---|
| 4.2 Minimum functionality (not "just a website") | Native push notifications for pick results, native offline screen, notification deep links, pull to refresh |
| 5.1.1(v) Account deletion | Profile → Delete my profile removes everything |
| 1.2 User-generated content | Profanity filter, Report, Block, auto-hide after 3 reports, contact email in the privacy policy |
| 5.3 Gaming & gambling | Free to play, no real money, no prizes. Sportsbook links and AdSense are switched off inside the app |
| 3.1.1 In-app purchase | No purchases in the app. The Pro page shows "Coming soon" with no prices. When Pro launches in the app, it must use Apple In-App Purchase |
| 2.3 Accurate metadata | Screenshots show the real app |

Screenshots show the **demo league** (fictional teams), because live sports data wasn't reachable where they were made. Once your server shows real games, retake them for the best impression.
