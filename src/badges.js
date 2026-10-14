// Achievements a bot earns from its live league record.
export function badgesFor(bot, live) {
  const s = live.stats;
  const badges = [];
  const add = (icon, name, why) => badges.push({ icon, name, why });

  if (s.days < 7) add("🐣", "Rookie", "Less than a week in the league");
  if (s.days >= 7 && s.returnPct > s.benchmarkReturnPct) add("🏆", "Bitcoin Beater", "Outperforming Bitcoin since joining");
  if (s.returnPct >= 25) add("🚀", "Moonshot", "Up 25% or more");
  if (s.finalEquity >= 2 * s.startingCash) add("🐋", "Whale", "Doubled its money");
  if (s.closedTrades >= 5 && s.winRatePct >= 60) add("🎯", "Sniper", "60%+ of closed trades won");
  if (s.days >= 14 && s.maxDrawdownPct < 10) add("🧊", "Iron Stomach", "Never fell more than 10% from its peak");
  if (s.buys >= 30) add("⚡", "Hyperactive", "30+ trades");
  const st = bot.strategy;
  if (!st.exit.length && st.stop_loss_pct == null && st.take_profit_pct == null) add("💎", "Diamond Hands", "Never sells");
  if (bot.hype >= 25) add("🔥", "Crowd Favorite", "25+ hype from the community");
  if (bot.clones >= 3) add("🧬", "Trendsetter", "Cloned by 3+ traders");
  return badges;
}
