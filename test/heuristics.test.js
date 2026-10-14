import assert from "node:assert/strict";
import { test } from "node:test";
import { compareQuotesOffline, draftRequestOffline } from "../src/heuristics.js";

test("extracts the key facts from a moving request", () => {
  const draft = draftRequestOffline(
    "I need my 2 bedroom apartment moved from Austin to Dallas next Saturday. 3rd floor, one piano. Budget around $1,800.",
  );
  assert.equal(draft.category, "Moving & storage");
  assert.equal(draft.location, "Austin → Dallas");
  assert.equal(draft.timeline, "Next Saturday");
  assert.equal(draft.budget, "$1,800");
  assert.ok(draft.title.startsWith("My 2 bedroom apartment moved"));
  assert.ok(draft.details.some((d) => d.label === "Quantity / size" && d.value === "2 bedroom"));
  assert.equal(draft.price_estimate, null);
});

test("detects products, quantities and city locations", () => {
  const draft = draftRequestOffline("500 custom printed t-shirts with our logo, delivered in Chicago by March 15");
  assert.equal(draft.category, "Products & manufacturing");
  assert.equal(draft.location, "Chicago");
  assert.equal(draft.timeline, "By March 15");
  assert.ok(draft.details.some((d) => d.value === "500 custom printed t-shirts"));
});

test("doesn't ask for facts the buyer already gave", () => {
  const draft = draftRequestOffline("Need a DJ for a birthday party in Miami on July 4, about 80 guests");
  assert.equal(draft.category, "Events & weddings");
  assert.ok(!draft.missing_info.some((q) => /guests|date/i.test(q)), draft.missing_info.join("; "));
  assert.ok(draft.missing_info.some((q) => /venue/i.test(q)));
});

test("asks for missing location and timing", () => {
  const draft = draftRequestOffline("Need a logo designed for my new coffee brand");
  assert.equal(draft.category, "Tech & creative");
  assert.equal(draft.location, "");
  assert.ok(draft.missing_info[0].startsWith("Where"));
  assert.ok(draft.missing_info.length <= 4);
});

test("ranks quotes on value, not just price", () => {
  const quotes = [
    { id: "a", businessName: "Cheap Co", price: 400, currency: "USD", yearsInBusiness: 0, includes: [], message: "" },
    { id: "b", businessName: "Solid Co", price: 900, currency: "USD", yearsInBusiness: 15, includes: ["Labor", "Materials", "Warranty"], message: "Detailed scope ".repeat(20) },
    { id: "c", businessName: "Pricey Co", price: 2000, currency: "USD", yearsInBusiness: 3, includes: ["Labor"], message: "" },
  ];
  const result = compareQuotesOffline({}, quotes);
  assert.equal(result.rankings.length, 3);
  assert.equal(result.best_quote_id, "b", "experience and a clear scope beat a vague lowball");
  assert.ok(result.red_flags.some((f) => f.includes("Cheap Co")));
  assert.match(result.negotiation_tip, /\$400/);
});

test("returns null when there are no quotes", () => {
  assert.equal(compareQuotesOffline({}, []), null);
});
