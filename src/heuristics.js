// Offline fallbacks for the two AI features. They let CotaSearch run end to end
// with no API key ("demo mode"), and they back up the live AI if a call fails.
import { CATEGORIES, CATEGORY_KEYWORDS } from "./categories.js";

const MONTHS =
  "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";
const WEEKDAYS = "monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend";

const TIMELINE_PATTERNS = [
  /\b(asap|urgent(?:ly)?|emergency|right away|today|tonight|tomorrow)\b/i,
  new RegExp(`\\b(?:next|this|by|before|on)\\s+(?:${WEEKDAYS}|week|month|year)\\b`, "i"),
  new RegExp(`\\b(?:by|before|on|in|around|early|mid|late)\\s+(?:${MONTHS})(?:\\s+\\d{1,2}(?:st|nd|rd|th)?)?\\b`, "i"),
  new RegExp(`\\b(?:${MONTHS})\\s+\\d{1,2}(?:st|nd|rd|th)?\\b`, "i"),
  /\b(?:with)?in\s+\d+\s+(?:days?|weeks?|months?)\b/i,
];

const PLACE = "[A-Z][\\w.'-]*(?:\\s+[A-Z][\\w.'-]*){0,3}(?:,\\s*[A-Z]{2}\\b)?";
const STOP_WORDS = new Set([
  "I", "We", "My", "Our", "The", "A", "An", "Next", "This", "By", "On", "Saturday", "Sunday",
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "ASAP",
]);

function cleanPlace(place) {
  const words = place.trim().split(/\s+/);
  while (words.length && STOP_WORDS.has(words[words.length - 1].replace(/[,.]$/, ""))) words.pop();
  return words.join(" ").replace(/[,.]$/, "");
}

export function detectCategory(text) {
  const lower = ` ${text.toLowerCase()} `;
  let best = "Other";
  let bestScore = 0;
  for (const category of CATEGORIES) {
    const keywords = CATEGORY_KEYWORDS[category] || [];
    const score = keywords.reduce((n, kw) => n + (lower.includes(kw) ? 1 : 0), 0);
    if (score > bestScore) {
      best = category;
      bestScore = score;
    }
  }
  return best;
}

export function detectLocation(text) {
  const fromTo = text.match(new RegExp(`\\bfrom\\s+(${PLACE})\\s+to\\s+(${PLACE})`));
  if (fromTo) {
    const from = cleanPlace(fromTo[1]);
    const to = cleanPlace(fromTo[2]);
    if (from && to) return `${from} → ${to}`;
  }
  const near = text.match(new RegExp(`\\b(?:in|near|around|at)\\s+(${PLACE})`));
  if (near) {
    const place = cleanPlace(near[1]);
    if (place && !new RegExp(`^(?:${MONTHS}|${WEEKDAYS})$`, "i").test(place)) return place;
  }
  return "";
}

export function detectTimeline(text) {
  for (const pattern of TIMELINE_PATTERNS) {
    const match = text.match(pattern);
    if (match) return match[0].charAt(0).toUpperCase() + match[0].slice(1);
  }
  return "";
}

export function detectBudget(text) {
  const match =
    text.match(/\b(?:budget|up to|under|max(?:imum)?|around|about)\s*(?:of|is|:)?\s*(\$\s?[\d,]+(?:\.\d+)?\s?[kK]?)/) ||
    text.match(/(\$\s?[\d,]+(?:\.\d+)?\s?[kK]?)/);
  return match ? match[1].replace(/\s+/g, "") : "";
}

export function detectQuantity(text) {
  // Allows a few words between the number and the unit: "500 custom printed t-shirts".
  const match = text.match(
    /\b\d[\d,]*\s*(?:x\s*)?(?:[a-z-]+\s+){0,3}?(?:units?|pieces?|pcs|people|guests|bedrooms?|rooms?|sq\.?\s?ft|square feet|boxes|items|shirts|t-shirts|bags|pages|hours|cars?)\b/i,
  );
  return match ? match[0] : "";
}

export function makeTitle(text) {
  let first = text.trim().split(/(?<=[.!?])\s+|\n/)[0] || text.trim();
  first = first
    .replace(/^(?:hi|hello|hey)[,!.\s]+/i, "")
    .replace(/^(?:i|we)\s+(?:really\s+)?(?:need|want|would like|'d like|am looking for|are looking for)\s+(?:to\s+(?:get|have|find)\s+)?/i, "")
    .replace(/^(?:looking for|need|want|get me|find me)\s+/i, "")
    .replace(/^(?:a|an|some|someone to|somebody to)\s+/i, "")
    .replace(/[.!?]+$/, "");
  if (first.length > 72) first = `${first.slice(0, 69).replace(/\s+\S*$/, "")}…`;
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : "New request";
}

const CATEGORY_QUESTIONS = {
  "Home services": ["Photos of the problem area", "Approximate size of the space", "Age of the home or system"],
  "Moving & storage": ["Number of rooms or approximate volume", "Stairs or elevator at each end", "Any heavy or fragile items (piano, safe, art)"],
  Auto: ["Year, make and model", "Mileage", "Any warning lights or symptoms"],
  "Events & weddings": ["Number of guests", "Event date and duration", "Venue, if already booked"],
  "Products & manufacturing": ["Exact quantity and sizes", "Material or quality requirements", "Artwork or specs file"],
  "Professional services": ["Scope of the work", "Deadline", "Any documents providers should review"],
  "Tech & creative": ["Examples you like", "Must-have features or deliverables", "Deadline"],
  "Health & wellness": ["What you're hoping to achieve", "Preferred schedule", "Insurance, if relevant"],
  Travel: ["Dates and flexibility", "Number of travelers", "Departure city"],
  Other: ["What a great result looks like", "Deadline", "Budget range"],
};

// Turns a plain-language request into the same shape the AI returns.
export function draftRequestOffline(text) {
  const category = detectCategory(text);
  const location = detectLocation(text);
  const timeline = detectTimeline(text);
  const budget = detectBudget(text);
  const quantity = detectQuantity(text);

  const details = [];
  if (quantity) details.push({ label: "Quantity / size", value: quantity });
  if (location) details.push({ label: "Location", value: location });
  if (timeline) details.push({ label: "When", value: timeline });
  if (budget) details.push({ label: "Budget", value: budget });

  const missing = [];
  if (!location) missing.push("Where is this needed? (city or ZIP)");
  if (!timeline) missing.push("When do you need it done?");
  for (const q of CATEGORY_QUESTIONS[category]) {
    if (missing.length >= 4) break;
    // Skip questions the description already answers.
    if (quantity && /number|quantity|size|volume/i.test(q)) continue;
    if (timeline && /date|deadline|schedule/i.test(q)) continue;
    if (budget && /budget/i.test(q)) continue;
    missing.push(q);
  }

  const summary = text.trim().replace(/\s+/g, " ");
  return {
    title: makeTitle(text),
    category,
    summary: summary.length > 400 ? `${summary.slice(0, 397)}…` : summary,
    location,
    timeline,
    budget,
    details,
    missing_info: missing,
    price_estimate: null,
  };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function money(amount, currency = "USD") {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount)}`;
  }
}

// Ranks quotes on price, experience and how clearly they describe the work.
export function compareQuotesOffline(request, quotes) {
  if (!quotes.length) return null;
  const prices = quotes.map((q) => q.price);
  const lowest = Math.min(...prices);
  const mid = median(prices);

  const scored = quotes.map((q) => {
    const priceScore = (lowest / q.price) * 100;
    const years = Number(q.yearsInBusiness) || 0;
    const experienceScore = Math.min(years, 10) * 10;
    const detail = (q.message || "").length + (q.includes || []).join(" ").length;
    const clarityScore = Math.min(detail / 200, 1) * 100;
    const score = Math.round(priceScore * 0.6 + experienceScore * 0.2 + clarityScore * 0.2);

    const pros = [];
    const cons = [];
    if (q.price === lowest) pros.push("Lowest price");
    else cons.push(`${Math.round(((q.price - lowest) / lowest) * 100)}% more than the lowest quote`);
    if (years >= 5) pros.push(`${years} years in business`);
    else if (years > 0) cons.push(`Only ${years} year${years === 1 ? "" : "s"} in business`);
    else cons.push("Didn't say how long they've been in business");
    if ((q.includes || []).length >= 2) pros.push(`Spells out what's included (${q.includes.length} items)`);
    else cons.push("Vague about what's included. Ask before you accept");
    if (q.timeline) pros.push(`Timeline: ${q.timeline}`);

    return { quote_id: q.id, score, pros, cons };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = quotes.find((q) => q.id === scored[0].quote_id);

  const redFlags = [];
  for (const q of quotes) {
    if (quotes.length >= 3 && q.price < mid * 0.5) {
      redFlags.push(`${q.businessName} is less than half the typical price. Confirm the full scope in writing.`);
    }
  }

  const tip =
    best.price > lowest
      ? `Tell ${best.businessName} you have an offer at ${money(lowest, best.currency)} and ask if they can come closer to it.`
      : `Ask ${best.businessName} to confirm the price is final and includes every fee.`;

  return {
    best_quote_id: best.id,
    headline: `${best.businessName} offers the best overall value at ${money(best.price, best.currency)}.`,
    rankings: scored,
    red_flags: redFlags,
    negotiation_tip: tip,
  };
}
