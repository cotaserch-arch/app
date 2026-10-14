// Betting-line math. Moneylines are American odds (-150, +130).

export function americanToDecimal(ml) {
  return ml > 0 ? 1 + ml / 100 : 1 + 100 / -ml;
}

export function decimalToAmerican(dec) {
  const raw = dec >= 2 ? (dec - 1) * 100 : -100 / (dec - 1);
  return Math.round(raw / 5) * 5 || 100;
}

// Raw implied probability (includes the bookmaker's margin).
export const impliedProb = (ml) => 1 / americanToDecimal(ml);

// Win probabilities for home/away with the margin removed. Soccer lines leave
// room for a draw, so the two sides don't have to add up to 1.
export function fairProbs(odds) {
  if (!odds?.homeML || !odds?.awayML) return null;
  const h = impliedProb(odds.homeML);
  const a = impliedProb(odds.awayML);
  const d = odds.drawML ? impliedProb(odds.drawML) : 0;
  const total = h + a + d;
  return { home: h / total, away: a / total, draw: d / total };
}

// A bookmaker-style line for a true probability, with ~4.5% margin.
export function lineFor(p, margin = 1.045) {
  return decimalToAmerican(1 / Math.min(0.97, Math.max(0.03, p * margin)));
}

export function formatML(ml) {
  if (ml == null) return "–";
  return ml > 0 ? `+${ml}` : `${ml}`;
}
