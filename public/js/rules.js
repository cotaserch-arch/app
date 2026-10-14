// Plain-English description of a betting bot's rules.
const PICK = {
  favorite: "Backs the favorite",
  underdog: "Backs the underdog",
  home: "Backs the home team",
  away: "Backs the road team",
  ai_pick: "Backs whoever the AI picks",
  fade_ai: "Bets against the AI's pick",
};

export function describeRules(r, sports) {
  const names = r.sports.length >= Object.keys(sports).length ? "Every sport" : r.sports.map((s) => `${sports[s].emoji} ${sports[s].label}`).join(", ");
  const items = [PICK[r.pick] || r.pick, names];
  if (r.min_prob != null && r.max_prob != null) items.push(`Only when that side has a ${r.min_prob}–${r.max_prob}% chance`);
  else if (r.min_prob != null) items.push(`Only when that side has at least a ${r.min_prob}% chance`);
  else if (r.max_prob != null) items.push(`Only when that side has at most a ${r.max_prob}% chance`);
  items.push(`🪙 ${r.stake} coins per bet, at the closing line`);
  return items;
}
