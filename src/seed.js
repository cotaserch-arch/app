// Sample requests and quotes so a fresh install doesn't look empty. Every
// record is flagged `sample: true` and labeled "Sample" in the UI.
import crypto from "node:crypto";

const hoursAgo = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
const id = () => crypto.randomBytes(6).toString("base64url");

const SAMPLES = [
  {
    request: {
      rawText: "Need my 2-bedroom apartment moved from Austin to Dallas next Saturday. 3rd floor with an elevator, one piano.",
      title: "2-bedroom move from Austin to Dallas with a piano",
      category: "Moving & storage",
      summary: "Buyer is moving a 2-bedroom apartment from Austin to Dallas next Saturday. Pickup is on the 3rd floor with an elevator. The load includes one upright piano.",
      location: "Austin → Dallas",
      timeline: "Next Saturday",
      budget: "",
      details: [
        { label: "Size", value: "2 bedrooms" },
        { label: "Access", value: "3rd floor, elevator available" },
        { label: "Special items", value: "1 upright piano" },
      ],
      priceEstimate: { low: 1400, high: 2600, currency: "USD", basis: "Long-distance 2-bedroom moves with a piano typically fall in this range." },
    },
    quotes: [
      { businessName: "Lone Star Movers", price: 1850, timeline: "Saturday, 8am pickup", yearsInBusiness: 12, includes: ["3 movers + 26ft truck", "Piano dolly and padding", "Fuel and tolls", "$100k cargo insurance"], message: "We do Austin to Dallas every week. Flat rate, no hourly surprises. Piano handled by our specialty crew." },
      { businessName: "QuickHaul TX", price: 1290, timeline: "Saturday, 10am pickup", yearsInBusiness: 2, includes: ["2 movers + truck"], message: "Cheapest rate in Austin." },
      { businessName: "Capital City Moving Co.", price: 2240, timeline: "Saturday or Sunday", yearsInBusiness: 20, includes: ["4 movers", "Full packing service", "Piano crate", "Full-value protection"], message: "Full-service move including packing your kitchen and wrapping furniture. Price is all-inclusive." },
    ],
    age: 5,
  },
  {
    request: {
      rawText: "500 custom printed t-shirts for a company event, 2-color logo on front, mixed sizes, needed by March 15.",
      title: "500 custom 2-color logo t-shirts by March 15",
      category: "Products & manufacturing",
      summary: "Company needs 500 custom t-shirts for an event, with a 2-color logo printed on the front in mixed sizes. Delivery is needed by March 15.",
      location: "",
      timeline: "By March 15",
      budget: "",
      details: [
        { label: "Quantity", value: "500 shirts, mixed sizes" },
        { label: "Print", value: "2-color logo, front only" },
      ],
      priceEstimate: { low: 2500, high: 5000, currency: "USD", basis: "Screen-printed tees at this volume usually run $5–10 each." },
    },
    quotes: [
      { businessName: "InkWorks Print Shop", price: 3150, timeline: "Ships in 10 business days", yearsInBusiness: 8, includes: ["Gildan Softstyle tees", "Screen setup", "Free digital proof", "Free shipping"], message: "$6.30/shirt all-in. We'll send a proof within 24 hours." },
      { businessName: "Bulk Tee Direct", price: 2600, timeline: "Ships in 3 weeks", yearsInBusiness: 4, includes: ["Basic cotton tees", "Screen setup"], message: "Shipping billed separately." },
    ],
    age: 20,
  },
  {
    request: {
      rawText: "Roof is leaking over the kitchen after the storm, need someone to look at it this week in Denver.",
      title: "Roof leak over the kitchen after a storm",
      category: "Home services",
      summary: "Buyer has a roof leak above the kitchen following a recent storm and needs an inspection and repair this week in Denver.",
      location: "Denver",
      timeline: "This week",
      budget: "",
      details: [{ label: "Problem", value: "Active leak over kitchen after storm" }],
      priceEstimate: { low: 350, high: 1200, currency: "USD", basis: "Most storm leak repairs are a few hundred dollars; widespread damage costs more." },
    },
    quotes: [],
    age: 1,
  },
  {
    request: {
      rawText: "Looking for a photographer for a 120-guest wedding in Miami on June 7, 8 hours coverage, budget around $3,000.",
      title: "Wedding photographer, 8 hours, 120 guests",
      category: "Events & weddings",
      summary: "Couple needs a wedding photographer for 8 hours of coverage at a 120-guest wedding in Miami on June 7. Budget is around $3,000.",
      location: "Miami",
      timeline: "June 7",
      budget: "$3,000",
      details: [
        { label: "Guests", value: "120" },
        { label: "Coverage", value: "8 hours" },
      ],
      priceEstimate: { low: 2200, high: 4500, currency: "USD", basis: "Full-day wedding photography in major US cities." },
    },
    quotes: [
      { businessName: "Golden Hour Studio", price: 2950, timeline: "June 7, 8 hours", yearsInBusiness: 9, includes: ["Lead + second shooter", "500+ edited photos", "Online gallery"], message: "We'd love to shoot your day. Engagement session included if you book this month." },
    ],
    age: 30,
  },
];

export function sampleData() {
  const requests = [];
  const quotes = [];
  for (const sample of SAMPLES) {
    const requestId = id();
    requests.push({
      id: requestId,
      ownerToken: crypto.randomBytes(24).toString("base64url"),
      createdAt: hoursAgo(sample.age),
      status: "open",
      sample: true,
      awardedQuoteId: null,
      analysis: null,
      contactName: "",
      ...sample.request,
    });
    sample.quotes.forEach((quote, i) => {
      quotes.push({
        id: id(),
        requestId,
        createdAt: hoursAgo(sample.age - (i + 1) * 0.5),
        sample: true,
        currency: "USD",
        email: "",
        ...quote,
      });
    });
  }
  return { requests, quotes };
}
