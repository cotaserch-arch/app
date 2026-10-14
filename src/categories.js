// The categories every request is filed under. Order matters: it is the order
// shown in dropdowns and filters.
export const CATEGORIES = [
  "Home services",
  "Moving & storage",
  "Auto",
  "Events & weddings",
  "Products & manufacturing",
  "Professional services",
  "Tech & creative",
  "Health & wellness",
  "Travel",
  "Other",
];

// Keyword hints used by the offline (demo-mode) request parser.
export const CATEGORY_KEYWORDS = {
  "Home services": [
    "plumb", "leak", "roof", "electric", "wiring", "paint", "clean", "hvac", "air condition",
    "furnace", "heater", "renovat", "remodel", "bathroom", "flooring", "hardwood", "tiling", "carpet",
    "window", "door", "fence", "landscap", "lawn", "garden", "pest", "handyman", "drywall",
    "gutter", "solar", "install", "repair", "contractor", "pool",
  ],
  "Moving & storage": ["move", "moving", "mover", "relocat", "storage", "haul", "junk removal", "packing", "piano"],
  Auto: [
    "car", "truck", "vehicle", "brake", "tire", "engine", "transmission", "oil change", "mechanic",
    "detailing", "windshield", "auto ", "motorcycle", "tow",
  ],
  "Events & weddings": [
    "wedding", "event", "party", "catering", "caterer", "dj", "photographer", "venue", "birthday",
    "conference", "florist", "bartend", "banquet",
  ],
  "Products & manufacturing": [
    "t-shirt", "tshirt", "shirts", "custom", "bulk", "wholesale", "manufactur", "print", "units",
    "pieces", "pcs", "packaging", "supplier", "merch", "order of", "sourcing", "factory",
  ],
  "Professional services": [
    "lawyer", "attorney", "legal", "accountant", "tax", "bookkeep", "consult", "insurance", "notary",
    "translat", "recruit", "real estate", "mortgage",
  ],
  "Tech & creative": [
    "website", "app", "software", "logo", "design", "video", "edit", "marketing", "seo", "develop",
    "branding", "copywrit", "animation", "it support",
  ],
  "Health & wellness": ["dentist", "dental", "therapy", "trainer", "massage", "clinic", "physio", "nutrition", "vet"],
  Travel: ["flight", "hotel", "trip", "tour", "vacation", "charter", "rental car", "airport"],
};
