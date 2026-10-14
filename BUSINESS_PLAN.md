# CotaSearch: business plan

## The honest part first

Nobody can promise a billion-dollar company or $1M in year one. Most startups fail, and most of the ones that succeed take years. What this plan does is put you on a path where those outcomes are *possible*. It aims at a huge market, uses a business model already proven at scale, and adds an advantage AI only recently made possible. Then it tells you exactly what to do this week.

## The idea in one sentence

**Tell CotaSearch what you need in plain words, and businesses compete to quote it while AI tells you which deal is best.**

## The problem

Getting a price for almost anything outside a shopping cart is still slow and painful: a move, a roof repair, a wedding photographer, 500 custom shirts, a website.

- You call or fill out forms with several businesses, one at a time.
- Every business asks the same questions, and you get answers back in different formats.
- You can't tell if a price is fair, or what's missing from a quote that looks cheap.

Businesses hate it too. They spend money on ads and time on calls with people who aren't ready to buy.

## The solution

1. **Describe it like you'd text a friend.** AI turns your words into a clear, quotable request. It fills in structure, flags missing details, and shows the typical price range.
2. **Businesses compete.** They see exactly what you need and send a price in about 60 seconds.
3. **AI picks the winner.** A side-by-side comparison with a value score, red flags and a negotiation tip. Accept with one tap.

**A working first version of all three steps is built and in this repository.**

## Why this can be big

- **The market is enormous.** Home services alone are worth hundreds of billions of dollars a year in the US, and that's just one category. CotaSearch covers *anything* that needs a quote: services, products, bulk orders, events.
- **The model is proven.** Thumbtack (valued at over $3B in 2021) and Angi built large companies by charging businesses for customer leads, mostly in home services. CotaSearch uses the same proven money model across far more categories.
- **AI changes the game.** Older platforms need a separate rigid form for every category, which is why they stay narrow. AI handles any request, in any words, in any category, from day one. It also gives buyers something nobody offers well: an unbiased analyst that compares quotes for them.

## How it makes money

Buyers always use it for free. Businesses pay, and only for real buyers.

| Stream | How it works | When |
|---|---|---|
| **Pay per quote** | Businesses buy credits to send quotes, about $3–$25 depending on job size. | Turn on once businesses are winning jobs (around months 2–3) |
| **Pro plan** | $49–$99/month: more quotes, instant alerts, an AI quote-writer, a profile badge | Months 4–6 |
| **Success fee** | 3–5% when the buyer pays through CotaSearch, with payment protection for both sides | Months 9–12 |

## The math to $1M a year

$1M a year is about **$83,000 a month**. Two ways to get there:

- **Pay per quote:** 3,000 requests a month (about 100 a day) × 3.5 quotes each × $8 average = **$84,000 a month**.
- **Subscriptions:** about 1,700 businesses on a $49/month Pro plan.

Realistically, a strong year one means *reaching* a $1M-a-year run rate by month 12. Total cash collected in year one would be well under $1M, because revenue ramps up over the year. Even that outcome puts you ahead of the vast majority of startups, and it is exactly what investors look for.

AI costs a few cents per request. Gross margins stay high.

## How to launch (and why to start small)

The *product* is for everything. The *launch* has to be focused. Marketplaces die when a buyer posts a request and nobody answers. Facebook started at one college for the same reason.

1. **Pick one city and three categories** you can fill reliably: for example moving, home repair and events.
2. **Supply first.** Personally sign up 30–100 local businesses. Call them, visit them, and offer free quotes during launch. Sell it as *"customers who already want to buy, no ad spend."*
3. **Seed demand.** Post 20+ real requests from friends, family and local groups. Every request page has a share link, and each share pulls in more businesses.
4. **Make content from real data.** Short videos and posts like *"We got 5 quotes to move a piano. They ranged from $1,250 to $2,400. Here's why."* Real price data is shareable and earns search traffic.
5. **Expand** city by city and category by category, once requests reliably get 3+ quotes within 24 hours.

### The big unlock (next to build)

An **AI outreach agent** that contacts businesses *not yet on CotaSearch*, by email (and later by phone), to collect quotes for the buyer. Every buyer gets quotes on day one, and every business contacted is a new signup. That turns the hardest problem in marketplaces (the empty start) into the growth engine.

## The long-term moat

- **Price data.** Every quote teaches CotaSearch what things *really* cost, where. Over time this becomes a *"Kelley Blue Book for everything"* that nobody else has, and it powers better estimates, search traffic and new products.
- **Network effects.** More buyers attract more businesses, which bring faster and better quotes, which attract more buyers.
- **Trust.** Reviews, job history and payment protection get harder to copy with every transaction.

## The numbers that matter

Track these weekly from day one:

1. **Fill rate.** % of requests that get 3+ quotes within 24 hours (target: 70%+). *This is the most important number.*
2. **Hire rate.** % of requests where the buyer accepts a quote (target: 30%+).
3. **Business win rate.** Businesses that win jobs keep paying. Ones that don't, leave.
4. **Repeat buyers.**

## Risks, honestly

| Risk | What to do about it |
|---|---|
| Chicken-and-egg (no businesses means no buyers) | Launch narrow, recruit supply by hand, build the AI outreach agent |
| Big competitors (Thumbtack, Angi, Google) | Win on *any* request, a buyer-first AI analyst and price transparency. Stay focused on the buyer. |
| Businesses complain about lead quality (common on pay-per-lead sites) | AI-written requests are complete and specific, and businesses pay only to quote what they choose |
| AI mistakes | AI drafts are always editable by the buyer, and the comparison shows its reasoning |
| Running out of money or time | Charge early, keep costs near zero (this app runs on one small server), and raise money only after the numbers above look good |

## Your next 10 steps

1. **Get an Anthropic API key** and put it in `.env`. That turns on the real AI.
2. **Put the site online.** The README has the steps, and the whole thing runs on one small server.
3. **Buy a domain** (e.g. a short .com or .ai).
4. **Form a company** (an LLC is fine to start).
5. **Pick your launch city and three categories.**
6. **Sign up 30 businesses** in those categories this week.
7. **Post 20 real requests** from people you know.
8. **Watch the fill rate** and talk to every early buyer and business.
9. **Turn on paid quote credits** (Stripe) once businesses are winning jobs.
10. **Build the AI outreach agent**, then expand.
