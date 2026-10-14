// Achievements fans earn from their record.
export function fanBadges(fan, stats, netWorth) {
  const badges = [];
  const add = (icon, name, why) => badges.push({ icon, name, why });
  if (stats.graded < 3) add("🐣", "Rookie", "Fewer than 3 graded picks");
  if (stats.streak >= 5) add("🔥", "Hot Streak", `${stats.streak} correct picks in a row`);
  if (stats.beatBotDays >= 1) add("🤖", "Bot Slayer", "Beat the AI on a day with 3+ picks");
  if (stats.graded >= 20 && stats.accuracy >= 65) add("🎯", "Oracle", "65%+ accuracy over 20+ picks");
  if (stats.upsets >= 3) add("💥", "Upset Caller", "Called 3+ underdog wins");
  if (netWorth >= 5000) add("🐋", "Whale", "5,000+ coin net worth");
  if (fan.trades >= 10) add("📈", "Trader", "10+ market trades");
  if (fan.referrals >= 3) add("🤝", "Recruiter", "Brought in 3+ fans");
  if (fan.chatCount >= 25) add("🗣️", "Hype Man", "25+ watch-party messages");
  return badges;
}
