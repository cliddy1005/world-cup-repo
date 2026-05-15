const COMPETITION = process.env.FOOTBALL_DATA_COMPETITION || "WC";
const SEASON = process.env.FOOTBALL_DATA_SEASON || "2026";
const SEASON_START = `${SEASON}-01-01`;
const SEASON_END = `${SEASON}-12-31`;

const LIVE_STATUSES = new Set(["LIVE", "IN_PLAY", "PAUSED"]);

export function mapStage(stage) {
  const s = String(stage || "").toUpperCase();
  if (s.includes("GROUP")) return "Group";
  if (s.includes("LAST_32") || s.includes("ROUND_OF_32")) return "R32";
  if (s.includes("LAST_16") || s.includes("ROUND_OF_16")) return "R16";
  if (s.includes("QUARTER")) return "QF";
  if (s.includes("SEMI")) return "SF";
  if (s.includes("THIRD")) return "3rd";
  if (s.includes("FINAL")) return "Final";
  return "Group";
}

export function normaliseGroup(groupName) {
  if (!groupName) return "";
  return String(groupName).replace("GROUP_", "").replace("Group ", "").replaceAll("_", " ");
}

function scorePart(match, key) {
  const score = match.score?.[key];
  if (typeof score?.home === "number" && typeof score?.away === "number") {
    return [score.home, score.away];
  }
  return null;
}

function normaliseMatch(match) {
  const stage = mapStage(match.stage);
  const ft = scorePart(match, "fullTime");
  const pen = scorePart(match, "penalties");
  const home = match.homeTeam || {};
  const away = match.awayTeam || {};

  const mdBase = Number(match.matchday || 0);
  const md = stage === "Group" ? mdBase : ({ R32: 40, R16: 50, QF: 60, SF: 70, "3rd": 80, Final: 90 }[stage] || mdBase || 99);

  return {
    id: String(match.id),
    fdId: match.id,
    h: home.name || home.shortName || "TBD",
    a: away.name || away.shortName || "TBD",
    hShort: home.shortName || home.name || "TBD",
    aShort: away.shortName || away.name || "TBD",
    hTla: home.tla || "",
    aTla: away.tla || "",
    hCrest: home.crest || "",
    aCrest: away.crest || "",
    g: normaliseGroup(match.group),
    s: stage,
    md,
    dt: match.utcDate || "",
    venue: match.venue || "",
    status: match.status || "SCHEDULED",
    minute: match.minute ?? null,
    hs: ft ? ft[0] : null,
    as: ft ? ft[1] : null,
    pen,
    done: match.status === "FINISHED",
    live: LIVE_STATUSES.has(match.status),
    lastUpdated: match.lastUpdated || null,
    rawScore: match.score || null
  };
}

function splitFixtures(matches) {
  const fixtures = {};
  const knockout = {};
  for (const match of matches) {
    const fx = normaliseMatch(match);
    if (fx.s === "Group") fixtures[fx.id] = fx;
    else knockout[fx.id] = fx;
  }
  return { fixtures, knockout };
}

export async function fetchFootballDataMatches(token) {
  const params = new URLSearchParams({
    season: SEASON,
    dateFrom: SEASON_START,
    dateTo: SEASON_END
  });
  const url = `https://api.football-data.org/v4/competitions/${COMPETITION}/matches?${params}`;
  const res = await fetch(url, { headers: { "X-Auth-Token": token } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`football-data.org ${res.status}: ${body}`);
  }
  return res.json();
}

export async function syncFootballData({ db, token }) {
  if (!token) throw new Error("FOOTBALL_DATA_TOKEN is not configured");
  const data = await fetchFootballDataMatches(token);
  const matches = (data.matches || []).filter(match => String(match.utcDate || "").startsWith(SEASON));
  const { fixtures, knockout } = splitFixtures(matches);
  const now = new Date().toISOString();
  const liveMatchCount = matches.filter(match => LIVE_STATUSES.has(match.status)).length;

  await db.ref("fixtures").set(fixtures);
  await db.ref("knockout").set(knockout);
  await db.ref("meta/footballData").set({
    source: "football-data.org",
    competition: COMPETITION,
    season: SEASON,
    dateFrom: SEASON_START,
    dateTo: SEASON_END,
    lastSyncedAt: now,
    requestCountThisRun: 1,
    matchCount: matches.length,
    liveMatchCount
  });

  return { ok: true, syncedAt: now, matchCount: matches.length, liveMatchCount };
}
