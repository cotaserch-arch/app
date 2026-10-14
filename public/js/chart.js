// Interactive line chart: account value over time for one or more series,
// with direct end labels, a legend, and a hover crosshair + tooltip.
import { escapeHtml, usd } from "./common.js";

const NS = "http://www.w3.org/2000/svg";
const shortDate = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function niceTicks(min, max, count = 4) {
  const span = max - min || Math.abs(max) || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || 10 * mag;
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) ticks.push(v);
  return ticks;
}

export function lineChart(container, { series, height = 280, baseline = null, format = (v) => usd(v, { compact: true }) }) {
  const legend =
    series.length > 1
      ? `<div class="chart-legend">${series
          .map((s) => `<span><span class="swatch ${s.dash ? "dash" : ""}" style="background:${s.color};color:${s.color}"></span>${escapeHtml(s.name)}</span>`)
          .join("")}</div>`
      : "";
  container.innerHTML = `${legend}<div class="chart"><svg role="img" aria-label="${escapeHtml(series.map((s) => s.name).join(" vs "))} account value over time"></svg><div class="tooltip hidden"></div></div>`;
  const wrap = container.querySelector(".chart");
  const svg = wrap.querySelector("svg");
  const tip = wrap.querySelector(".tooltip");

  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort();
  const lookup = series.map((s) => new Map(s.points.map((p) => [p.date, p.equity])));
  const values = series.flatMap((s) => s.points.map((p) => p.equity)).concat(baseline == null ? [] : [baseline]);
  if (dates.length < 2) {
    wrap.innerHTML = '<div class="empty">📈 The chart starts filling in after its first full day in the league. Check back tomorrow.</div>';
    return;
  }
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  // Give flat lines some room so the axis labels stay distinct.
  const minSpan = Math.abs(hi) * 0.04 || 1;
  if (hi - lo < minSpan) {
    const mid = (hi + lo) / 2;
    lo = mid - minSpan / 2;
    hi = mid + minSpan / 2;
  }
  const pad = (hi - lo) * 0.08;
  lo -= pad;
  hi += pad;

  function draw() {
    const width = Math.max(280, wrap.clientWidth);
    const m = { top: 10, right: width < 480 ? 64 : 96, bottom: 26, left: 52 };
    const w = width - m.left - m.right;
    const h = height - m.top - m.bottom;
    const x = (i) => m.left + (dates.length === 1 ? w : (i / (dates.length - 1)) * w);
    const y = (v) => m.top + h - ((v - lo) / (hi - lo)) * h;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("height", height);

    let out = "";
    for (const t of niceTicks(lo, hi)) {
      out += `<line class="grid-line" x1="${m.left}" x2="${m.left + w}" y1="${y(t)}" y2="${y(t)}"/>`;
      out += `<text class="axis-label" x="${m.left - 8}" y="${y(t) + 4}" text-anchor="end">${escapeHtml(format(t))}</text>`;
    }
    if (baseline != null) {
      out += `<line x1="${m.left}" x2="${m.left + w}" y1="${y(baseline)}" y2="${y(baseline)}" stroke="var(--ink-3)" stroke-width="1" stroke-dasharray="2 4"/>`;
    }
    const xTicks = dates.length > 2 ? [0, Math.floor((dates.length - 1) / 2), dates.length - 1] : [0, dates.length - 1];
    for (const i of [...new Set(xTicks)]) {
      const anchor = i === 0 ? "start" : i === dates.length - 1 ? "end" : "middle";
      out += `<text class="axis-label" x="${x(i)}" y="${height - 6}" text-anchor="${anchor}">${shortDate(dates[i])}</text>`;
    }

    const ends = [];
    series.forEach((s, k) => {
      const d = dates
        .map((date, i) => (lookup[k].has(date) ? `${x(i).toFixed(1)},${y(lookup[k].get(date)).toFixed(1)}` : null))
        .filter(Boolean);
      if (!d.length) return;
      out += `<polyline points="${d.join(" ")}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" ${s.dash ? 'stroke-dasharray="6 4"' : ""}/>`;
      const last = s.points.at(-1);
      ends.push({ y: y(last.equity), label: `${s.short ?? s.name} ${format(last.equity)}`, color: s.color });
    });
    // Keep end labels from overlapping.
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 15) ends[i].y = ends[i - 1].y + 15;
    for (const e of ends) {
      out += `<circle cx="${m.left + w}" cy="${e.y}" r="4" fill="${e.color}" stroke="var(--surface)" stroke-width="2"/>`;
      out += `<text class="end-label" x="${m.left + w + 8}" y="${e.y + 4}">${escapeHtml(e.label)}</text>`;
    }
    out += `<g class="hover hidden"><line class="crosshair" y1="${m.top}" y2="${m.top + h}"/>${series.map((s) => `<circle r="4.5" fill="${s.color}" stroke="var(--surface)" stroke-width="2"/>`).join("")}</g>`;
    out += `<rect class="hit" x="${m.left}" y="${m.top}" width="${w}" height="${h}" fill="transparent"/>`;
    svg.innerHTML = out;

    const hover = svg.querySelector(".hover");
    const hit = svg.querySelector(".hit");
    const move = (evt) => {
      const rect = svg.getBoundingClientRect();
      const px = ((evt.clientX - rect.left) / rect.width) * width;
      const i = Math.max(0, Math.min(dates.length - 1, Math.round(((px - m.left) / w) * (dates.length - 1))));
      const cx = x(i);
      hover.classList.remove("hidden");
      hover.querySelector("line").setAttribute("x1", cx);
      hover.querySelector("line").setAttribute("x2", cx);
      const rows = [];
      hover.querySelectorAll("circle").forEach((c, k) => {
        const v = lookup[k].get(dates[i]);
        if (v == null) return c.setAttribute("visibility", "hidden");
        c.setAttribute("visibility", "visible");
        c.setAttribute("cx", cx);
        c.setAttribute("cy", y(v));
        rows.push(`<div><span class="swatch" style="background:${series[k].color}"></span>${escapeHtml(series[k].name)}: <b class="num">${usd(v)}</b></div>`);
      });
      tip.innerHTML = `<div class="t-date">${shortDate(dates[i])}</div>${rows.join("")}`;
      tip.classList.remove("hidden");
      const left = (cx / width) * rect.width;
      const flip = left > rect.width / 2;
      tip.style.left = flip ? "" : `${left + 12}px`;
      tip.style.right = flip ? `${rect.width - left + 12}px` : "";
      tip.style.top = "8px";
    };
    const leave = () => {
      hover.classList.add("hidden");
      tip.classList.add("hidden");
    };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", leave);
  }

  draw();
  let last = wrap.clientWidth;
  new ResizeObserver(() => {
    if (Math.abs(wrap.clientWidth - last) > 4) {
      last = wrap.clientWidth;
      draw();
    }
  }).observe(wrap);
}
