// Turns a strategy into plain-English rules. Shared by the server and the
// browser, so it has no imports.

const fmt = (n) => `${Math.round(Math.abs(n) * 10) / 10}%`;
const days = (p) => (p === 1 ? "day" : p === 7 ? "week" : p === 30 ? "30 days" : `${p} days`);

export function describeCondition(c) {
  const { indicator, period, period2, op, value } = c;
  switch (indicator) {
    case "change_pct":
      if (op === "below" && value <= 0) return `Price is down more than ${fmt(value)} over the last ${days(period)}`;
      if (op === "above" && value >= 0) return `Price is up more than ${fmt(value)} over the last ${days(period)}`;
      return `Price change over the last ${days(period)} is ${op} ${value > 0 ? "+" : value < 0 ? "-" : ""}${fmt(value)}`;
    case "price_vs_sma":
      if (value === 0) return `Price is ${op} its ${period}-day average`;
      if (op === "above" && value > 0) return `Price is more than ${fmt(value)} above its ${period}-day average`;
      if (op === "below" && value < 0) return `Price is more than ${fmt(value)} below its ${period}-day average`;
      return `Price vs its ${period}-day average is ${op} ${value > 0 ? "+" : "-"}${fmt(value)}`;
    case "sma_cross":
      return `The ${period}-day average is ${op} the ${period2}-day average${
        value === 0 ? (op === "above" ? " (uptrend)" : " (downtrend)") : ` by ${fmt(value)}`
      }`;
    case "rsi": {
      const tag = op === "below" && value <= 35 ? " (oversold)" : op === "above" && value >= 65 ? " (overbought)" : "";
      return `RSI(${period}) is ${op} ${Math.round(value)}${tag}`;
    }
    case "drawdown_from_high":
      return op === "above"
        ? `Price is more than ${fmt(value)} below its ${period}-day high`
        : `Price is within ${fmt(value)} of its ${period}-day high`;
    case "volatility":
      return `Daily price swings over the last ${days(period)} average ${op === "above" ? "more" : "less"} than ${fmt(value)}`;
    default:
      return "Unknown rule";
  }
}

export function describeStrategy(s, assetCount = 10) {
  const sections = [];
  sections.push({
    title: "Trades",
    items: [s.assets.length >= assetCount ? `All ${s.assets.length} coins` : s.assets.join(", ")],
  });

  const buy = s.entry.map(describeCondition);
  if (s.rank_by_momentum) {
    buy.push(`The coin is one of the top ${s.rank_by_momentum.top_n} performers over the last ${days(s.rank_by_momentum.period)}`);
  }
  sections.push({
    title: buy.length > 1 ? "Buys when ALL of these are true" : "Buys when",
    items: buy.length ? buy : ["Right away. It buys and holds"],
  });

  const sell = s.exit.map(describeCondition);
  if (s.stop_loss_pct != null) sell.push(`It falls ${fmt(s.stop_loss_pct)} below the buy price (stop loss)`);
  if (s.take_profit_pct != null) sell.push(`It rises ${fmt(s.take_profit_pct)} above the buy price (take profit)`);
  sections.push({
    title: sell.length > 1 ? "Sells when ANY of these happen" : "Sells when",
    items: sell.length ? sell : ["Never. Diamond hands 💎"],
  });

  sections.push({
    title: "Position size",
    items: [`${fmt(s.position_size_pct)} of the account per buy, up to ${s.max_positions} coin${s.max_positions === 1 ? "" : "s"} at once`],
  });
  return sections;
}
