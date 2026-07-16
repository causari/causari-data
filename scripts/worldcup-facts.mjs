const TITLE_RE = /^(.*?)\s+(\d{1,2})\s*[–-]\s*(\d{1,2})(?:\s*\(\s*(\d{1,2})\s*[–-]\s*(\d{1,2})\s*pens?\.?\s*\))?\s+(.*)$/i;
const PLACEHOLDER_RE = /^(?:W|L)\d+$/i;

export function asMatchNumber(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function matchKey(value) {
  const n = asMatchNumber(value);
  return n == null ? null : `wc2026-match-${String(n).padStart(3, '0')}`;
}

export function isPlaceholderTeam(value) {
  return PLACEHOLDER_RE.test(String(value ?? '').trim());
}

export function isPlaceholderEvent(event) {
  if (!event) return false;
  const entities = Array.isArray(event.entities) ? event.entities : [];
  if (entities.some(isPlaceholderTeam)) return true;
  const title = String(event.title ?? '');
  return /(?:^|\s)(?:W|L)\d+(?:\s|$)/i.test(title);
}

function scorePair(value) {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const a = Number(value[0]);
  const b = Number(value[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return [a, b];
}

export function normalizeOutcome(score) {
  if (!score || typeof score !== 'object') return null;
  const regulation = scorePair(score.ft);
  const extraTime = scorePair(score.et);
  const penalties = scorePair(score.p);
  if (!regulation && !extraTime && !penalties) return null;

  const final = extraTime || regulation;
  if (!final) return null;

  const decidedBy = penalties
    ? 'penalties'
    : extraTime
      ? 'extra_time'
      : 'regular_time';

  return {
    regulation: regulation || final,
    final,
    ...(extraTime ? { extraTime } : {}),
    ...(penalties ? { penalties } : {}),
    decidedBy,
  };
}

export function formatResultTitle(team1, team2, outcome) {
  if (!outcome) return `${team1} vs ${team2}`;
  const [a, b] = outcome.final;
  const pens = outcome.penalties
    ? ` (${outcome.penalties[0]}–${outcome.penalties[1]} pens)`
    : '';
  return `${team1} ${a}–${b}${pens} ${team2}`;
}

export function formatResultDescription(team1, team2, lane, outcome) {
  if (!outcome) return `${lane} fixture: ${team1} vs ${team2}.`;
  const [a, b] = outcome.final;
  const winner = outcome.penalties
    ? (outcome.penalties[0] > outcome.penalties[1] ? team1 : team2)
    : (a > b ? team1 : b > a ? team2 : null);

  if (!winner) return `${team1} drew ${team2} ${a}–${b} in ${lane}.`;
  const winnerIsTeam1 = winner === team1;
  const loser = winnerIsTeam1 ? team2 : team1;
  const winnerScore = winnerIsTeam1 ? a : b;
  const loserScore = winnerIsTeam1 ? b : a;
  const penaltyScore = outcome.penalties
    ? (winnerIsTeam1 ? outcome.penalties : [outcome.penalties[1], outcome.penalties[0]])
    : null;
  const suffix = outcome.decidedBy === 'extra_time'
    ? ' after extra time'
    : outcome.decidedBy === 'penalties'
      ? ` on penalties ${penaltyScore[0]}–${penaltyScore[1]}`
      : '';
  return `${winner} beat ${loser} ${winnerScore}–${loserScore}${suffix} in ${lane}.`;
}

export function parseResultTitle(title) {
  const m = String(title ?? '').match(TITLE_RE);
  if (!m) return null;
  return {
    team1: m[1].trim(),
    final: [Number(m[2]), Number(m[3])],
    penalties: m[4] == null ? null : [Number(m[4]), Number(m[5])],
    team2: m[6].trim(),
  };
}

export function factFingerprint(event) {
  const result = event?.result;
  const final = scorePair(result?.final);
  const penalties = scorePair(result?.penalties);
  if (final) {
    return JSON.stringify({ final, penalties });
  }
  const parsed = parseResultTitle(event?.title);
  if (!parsed) return null;
  return JSON.stringify({ final: parsed.final, penalties: parsed.penalties });
}

function sourceIdentity(source) {
  if (!source || typeof source !== 'object') return null;
  return String(
    source.sourceId
      || source.url
      || source.citation
      || source.name
      || '',
  ).trim().toLowerCase() || null;
}

export function mergeSources(...lists) {
  const out = [];
  const seen = new Set();
  for (const list of lists) {
    for (const source of Array.isArray(list) ? list : []) {
      const key = sourceIdentity(source) || JSON.stringify(source);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(source);
    }
  }
  return out;
}

export function hasIndependentSource(event, sourceId = 'openfootball:worldcup-2026') {
  const sources = Array.isArray(event?.sources) ? event.sources : [];
  return sources.some((source) => {
    const id = String(source?.sourceId ?? '').toLowerCase();
    const citation = String(source?.citation ?? '').toLowerCase();
    const url = String(source?.url ?? '').toLowerCase();
    return !id.includes(sourceId.toLowerCase())
      && !citation.includes('openfootball/worldcup.json')
      && !url.includes('openfootball/worldcup.json');
  });
}

export function assertNoIndependentFactConflict(existing, fresh) {
  if (!existing || !fresh || isPlaceholderEvent(existing)) return;
  const oldFact = factFingerprint(existing);
  const newFact = factFingerprint(fresh);
  if (!oldFact || !newFact || oldFact === newFact) return;
  if (!hasIndependentSource(existing)) return;
  throw new Error(
    `fact conflict for match ${fresh.matchNumber ?? fresh.id}: existing independently sourced result differs from ingest; review manually instead of overwriting`,
  );
}

export function normalizeTeamPair(a, b) {
  return [String(a ?? '').trim().toLowerCase(), String(b ?? '').trim().toLowerCase()]
    .sort()
    .join('|');
}

export function eventTeamPair(event) {
  const parsed = parseResultTitle(event?.title);
  if (parsed) return normalizeTeamPair(parsed.team1, parsed.team2);
  const entities = Array.isArray(event?.entities) ? event.entities : [];
  const teams = entities.filter((x) => !/^group\s+[a-l]$/i.test(String(x)) && !/round|final|quarter|semi|third/i.test(String(x)));
  if (teams.length >= 2) return normalizeTeamPair(teams[0], teams[1]);
  const title = String(event?.title ?? '');
  const vs = title.match(/^(.*?)\s+vs\s+(.*?)$/i);
  return vs ? normalizeTeamPair(vs[1], vs[2]) : null;
}

export function outcomeWinner(team1, team2, outcome) {
  if (!outcome) return null;
  if (outcome.penalties) {
    if (outcome.penalties[0] === outcome.penalties[1]) return null;
    return outcome.penalties[0] > outcome.penalties[1] ? team1 : team2;
  }
  if (outcome.final[0] === outcome.final[1]) return null;
  return outcome.final[0] > outcome.final[1] ? team1 : team2;
}
