import Constants from 'expo-constants';

// See DECISION_LOG D-006. Verification deferred; the fixture path is
// primary so a wrong key here only triggers a silent fall-through in
// refreshMatches, not a user-visible failure.
export const WORLD_CUP_SPORT_KEY = 'soccer_fifa_world_cup';

const BASE_URL = 'https://api.the-odds-api.com/v4';

export type MatchStatus = 'upcoming' | 'live' | 'concluded';

export interface NormalizedMatch {
  id: string;
  sport_key: string;
  commence_time: number;
  home_team: string;
  away_team: string;
  odds_home: number | null;
  odds_draw: number | null;
  odds_away: number | null;
  status: MatchStatus;
}

export interface NormalizedScore {
  id: string;
  home_score: number | null;
  away_score: number | null;
  completed: boolean;
}

export type FetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: string };

interface RawOutcome {
  name: string;
  price: number;
}

interface RawMarket {
  key: string;
  outcomes: RawOutcome[];
}

interface RawBookmaker {
  key: string;
  markets: RawMarket[];
}

interface RawOddsResponse {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: RawBookmaker[];
}

interface RawScoreOutcome {
  name: string;
  score: string;
}

interface RawScoresResponse {
  id: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores: RawScoreOutcome[] | null;
}

function getApiKey(): string {
  const key = Constants.expoConfig?.extra?.oddsApiKey as string | undefined | null;
  if (!key) {
    throw new Error('ODDS_API_KEY not configured');
  }
  return key;
}

export function hasApiKey(): boolean {
  const key = Constants.expoConfig?.extra?.oddsApiKey as string | undefined | null;
  return typeof key === 'string' && key.length > 0;
}

// Pick the highest decimal price across all bookmakers for each outcome.
// See DECISION_LOG D-007 — best-for-user normalization.
function bestPrice(raw: RawOddsResponse, outcomeName: string): number | null {
  let best: number | null = null;
  for (const b of raw.bookmakers) {
    for (const m of b.markets) {
      if (m.key !== 'h2h') continue;
      for (const o of m.outcomes) {
        if (o.name !== outcomeName) continue;
        if (typeof o.price !== 'number') continue;
        if (best === null || o.price > best) best = o.price;
      }
    }
  }
  return best;
}

function normalizeMatch(raw: RawOddsResponse): NormalizedMatch {
  return {
    id: raw.id,
    sport_key: raw.sport_key,
    commence_time: Math.floor(new Date(raw.commence_time).getTime() / 1000),
    home_team: raw.home_team,
    away_team: raw.away_team,
    odds_home: bestPrice(raw, raw.home_team),
    odds_draw: bestPrice(raw, 'Draw'),
    odds_away: bestPrice(raw, raw.away_team),
    status: 'upcoming',
  };
}

function normalizeScore(raw: RawScoresResponse): NormalizedScore {
  let home: number | null = null;
  let away: number | null = null;
  if (Array.isArray(raw.scores)) {
    for (const s of raw.scores) {
      const n = parseInt(s.score, 10);
      if (Number.isNaN(n)) continue;
      if (s.name === raw.home_team) home = n;
      else if (s.name === raw.away_team) away = n;
    }
  }
  return {
    id: raw.id,
    home_score: home,
    away_score: away,
    completed: raw.completed === true,
  };
}

export async function fetchWorldCupOdds(
  sportKey: string = WORLD_CUP_SPORT_KEY,
): Promise<FetchResult<NormalizedMatch[]>> {
  let apiKey: string;
  try {
    apiKey = getApiKey();
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
  const url =
    `${BASE_URL}/sports/${sportKey}/odds` +
    `?apiKey=${encodeURIComponent(apiKey)}` +
    `&regions=uk,eu&markets=h2h&oddsFormat=decimal`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { ok: false, reason: `HTTP ${res.status}` };
    }
    const raw = (await res.json()) as RawOddsResponse[];
    if (!Array.isArray(raw)) {
      return { ok: false, reason: 'unexpected response shape' };
    }
    return { ok: true, data: raw.map(normalizeMatch) };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

export async function fetchWorldCupScores(
  daysFrom: number,
  sportKey: string = WORLD_CUP_SPORT_KEY,
): Promise<FetchResult<NormalizedScore[]>> {
  let apiKey: string;
  try {
    apiKey = getApiKey();
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
  const url =
    `${BASE_URL}/sports/${sportKey}/scores` +
    `?apiKey=${encodeURIComponent(apiKey)}` +
    `&daysFrom=${daysFrom}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { ok: false, reason: `HTTP ${res.status}` };
    }
    const raw = (await res.json()) as RawScoresResponse[];
    if (!Array.isArray(raw)) {
      return { ok: false, reason: 'unexpected response shape' };
    }
    return { ok: true, data: raw.map(normalizeScore) };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

// MANUAL INVOCATION ONLY. Do not call from runtime code — each call
// costs one API request against the 500/month free-tier quota. Use
// this from a dev script or a one-off REPL to verify WORLD_CUP_SPORT_KEY
// and update the constant above if needed. See DECISION_LOG D-006.
export async function discoverSportKey(): Promise<FetchResult<string | null>> {
  let apiKey: string;
  try {
    apiKey = getApiKey();
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
  try {
    const res = await fetch(
      `${BASE_URL}/sports?apiKey=${encodeURIComponent(apiKey)}`,
    );
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const sports = (await res.json()) as Array<{ key: string; title: string }>;
    const match = sports.find((s) =>
      /world.*cup/i.test(s.title) && !/qualif/i.test(s.title),
    );
    return { ok: true, data: match?.key ?? null };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
