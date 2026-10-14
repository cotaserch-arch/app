import { signed } from "./common.js";

export function statTiles(s) {
  const tile = (label, value) => `<div class="stat"><div class="label">${label}</div><div class="value">${value}</div></div>`;
  return [
    tile("Profit", s.profit === 0 ? "0" : `<span class="${s.profit > 0 ? "up" : "down"}">${s.profit > 0 ? "▲" : "▼"} ${signed(s.profit)}</span>`),
    tile("ROI", s.roiPct == null ? "–" : `${s.roiPct > 0 ? "+" : ""}${s.roiPct}%`),
    tile("Record", `${s.wins}-${s.losses}`),
    tile("Win rate", s.winPct == null ? "–" : `${s.winPct}%`),
  ].join("");
}
