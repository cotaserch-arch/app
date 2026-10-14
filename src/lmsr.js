// Prediction-market pricing with a logarithmic market scoring rule (LMSR).
// Each market has YES and NO shares; a winning share pays 1 coin. The price of
// YES is the crowd's probability, and it moves as people buy and sell.

export const LIQUIDITY = 800;

function logSumExp(a, b) {
  const m = Math.max(a, b);
  return m + Math.log(Math.exp(a - m) + Math.exp(b - m));
}

export function cost({ qYes, qNo }, b = LIQUIDITY) {
  return b * logSumExp(qYes / b, qNo / b);
}

export function priceYes({ qYes, qNo }, b = LIQUIDITY) {
  return 1 / (1 + Math.exp((qNo - qYes) / b));
}

// Starting state that prices YES at probability p.
export function openAt(p, b = LIQUIDITY) {
  const q = Math.min(0.97, Math.max(0.03, p));
  return { qYes: b * Math.log(q / (1 - q)), qNo: 0 };
}

// How many shares `coins` buys, and the market state afterwards.
export function buy(state, outcome, coins, b = LIQUIDITY) {
  const key = outcome === "yes" ? "qYes" : "qNo";
  const other = outcome === "yes" ? "qNo" : "qYes";
  const target = (cost(state, b) + coins) / b;
  const o = state[other] / b;
  // Solve b·ln(e^((q+x)/b) + e^(other/b)) = cost + coins for x.
  const shares = b * (target + Math.log1p(-Math.exp(o - target))) - state[key];
  return { shares, state: { ...state, [key]: state[key] + shares } };
}

// Coins received for selling `shares`, and the state afterwards.
export function sell(state, outcome, shares, b = LIQUIDITY) {
  const key = outcome === "yes" ? "qYes" : "qNo";
  const next = { ...state, [key]: state[key] - shares };
  return { coins: cost(state, b) - cost(next, b), state: next };
}
