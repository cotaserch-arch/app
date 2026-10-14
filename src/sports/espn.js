// Real games from ESPN's public scoreboard feeds (no API key). These endpoints
// are unofficial; before a commercial launch, switch to a licensed data
// provider. Only this file needs to change.
import { SPORTS, SPORT_KEYS } from "./teams.js";

const num = (v) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

function moneyline(odds, side) {
  const direct = odds?.[`${side}TeamOdds`]?.moneyLine;
  if (direct != null) return num(direct);
  const nested = odds?.moneyline?.[side]?.close?.odds ?? odds?.moneyline?.[side]?.open?.odds;
  return num(typeof nested === "string" ? nested.replace("+", "") : nested);
}

function team(c) {
  return {
    id: `espn-${c.team?.id ?? c.id}`,
    abbr: c.team?.abbreviation ?? "",
    name: c.team?.displayName ?? c.team?.name ?? "TBD",
    short: c.team?.shortDisplayName ?? c.team?.name ?? "",
    logo: c.team?.logo ?? null,
    record: c.records?.[0]?.summary ?? "",
  };
}

export function parseScoreboard(json, sport) {
  const games = [];
  for (const ev of json?.events ?? []) {
    const comp = ev.competitions?.[0];
    const home = comp?.competitors?.find((c) => c.homeAway === "home");
    const away = comp?.competitors?.find((c) => c.homeAway === "away");
    if (!home || !away) continue;
    const state = ev.status?.type?.state;
    const status = state === "in" ? "live" : state === "post" ? "final" : "scheduled";
    const hs = num(home.score);
    const as = num(away.score);
    const odds = comp.odds?.[0];
    const homeML = moneyline(odds, "home");
    const awayML = moneyline(odds, "away");
    let winner = null;
    if (status === "final") winner = home.winner ? "home" : away.winner ? "away" : hs === as ? "draw" : hs > as ? "home" : "away";
    games.push({
      id: `espn-${sport}-${ev.id}`,
      source: "espn",
      sport,
      league: SPORTS[sport].league,
      startsAt: new Date(ev.date).toISOString(),
      status,
      clock: status === "scheduled" ? null : ev.status?.type?.shortDetail ?? null,
      home: { ...team(home), score: status === "scheduled" ? null : hs },
      away: { ...team(away), score: status === "scheduled" ? null : as },
      odds:
        homeML != null && awayML != null
          ? { homeML, awayML, drawML: num(odds?.drawOdds?.moneyLine), total: num(odds?.overUnder) }
          : odds?.overUnder != null
            ? { homeML: null, awayML: null, drawML: null, total: num(odds.overUnder) }
            : null,
      winner,
      overtime: /OT|AET|SO/.test(ev.status?.type?.shortDetail ?? ""),
    });
  }
  return games;
}

const ymd = (ms) => new Date(ms).toISOString().slice(0, 10).replaceAll("-", "");

export async function fetchEspnDays({ dayOffsets, fetchImpl = fetch, now = Date.now(), sports = SPORT_KEYS }) {
  const games = [];
  for (const sport of sports) {
    for (const offset of dayOffsets) {
      const url = `https://site.api.espn.com/apis/site/v2/sports/${SPORTS[sport].espn}/scoreboard?dates=${ymd(now + offset * 86_400_000)}`;
      const res = await fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`${sport} ${offset}: HTTP ${res.status}`);
      games.push(...parseScoreboard(await res.json(), sport));
    }
  }
  return games;
}
