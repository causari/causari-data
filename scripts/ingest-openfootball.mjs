#!/usr/bin/env node
// Ingest World Cup 2026 schedule/results from openfootball and reconcile them
// against the curated pack without treating a human-readable event id as the
// identity of a match. Match number is the stable identity when the source
// provides it; title/team/date ids remain presentation-friendly aliases.
//
// Facts owned by the feed: participants, schedule, status and structured result.
// Editorial fields owned by Causari: whyItMatters, watchpoints, bilingual prose,
// causal links and insight patterns. Source citations are UNIONED, never replaced.
// Cross-source factual conflicts fail closed for manual review.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePackData } from './validate-pack.mjs';
import { assessCausalQuality } from './causal-quality.mjs';
import {
  asMatchNumber,
  assertNoIndependentFactConflict,
  eventTeamPair,
  formatResultDescription,
  formatResultTitle,
  isPlaceholderEvent,
  isPlaceholderTeam,
  matchKey,
  mergeSources,
  normalizeOutcome,
  outcomeWinner,
} from './worldcup-facts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'packs', 'worldcup-2026');
const SRC = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';
const SOURCE = {
  type: 'open-data',
  role: 'schedule-result-feed',
  sourceId: 'openfootball:worldcup-2026',
  citation: 'openfootball/worldcup.json (public domain)',
  url: 'https://github.com/openfootball/worldcup.json',
};
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Sources are intentionally excluded. Provenance from Reuters/AP/FIFA/editorial
// inputs must survive a mechanical refresh.
const INGEST_OWNED = new Set([
  'title', 'date', 'dateLabel', 'status', 'yearNum', 'yearLabel', 'precision',
  'matchNumber', 'matchKey', 'sourceMatchId', 'result', 'venue', 'kickoff',
]);
const TEMPLATED_WHY = [/^scorers:/i, /^full-time\s+\d/i, /^upcoming\s+.*match/i];
const isTemplatedWhy = (w) => TEMPLATED_WHY.some((re) => re.test(String(w ?? '')));

function readJsonIfExists(path, fallback) {
  if (!existsSync(path)) return fallback;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}

const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const dateLabel = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};
const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

async function loadMatches() {
  const arg = process.argv[2];
  if (arg) return JSON.parse(readFileSync(arg, 'utf8')).matches;
  const res = await fetch(SRC);
  if (!res.ok) throw new Error(`fetch ${SRC} -> ${res.status}`);
  return (await res.json()).matches;
}

function sourceMatchId(m) {
  const n = asMatchNumber(m.num);
  return n != null
    ? `openfootball:worldcup-2026:${n}`
    : `openfootball:worldcup-2026:${m.date}:${slug(m.team1)}:${slug(m.team2)}`;
}

function buildEvents(matches) {
  const pairs = [];
  const seen = new Set();
  for (const m of matches) {
    const t1 = m.team1;
    const t2 = m.team2;
    const lane = m.group || m.round || 'Knockouts';
    let id = `wc2026-${slug(t1)}-${slug(t2)}-${m.date.slice(5).replace('-', '')}`;
    while (seen.has(id)) id += 'x';
    seen.add(id);

    const outcome = normalizeOutcome(m.score);
    const played = !!outcome;
    const dd = dateLabel(m.date);
    const n = asMatchNumber(m.num);
    let title;
    let description;
    let whyItMatters;
    let impactScore;

    if (played) {
      title = formatResultTitle(t1, t2, outcome);
      description = formatResultDescription(t1, t2, lane, outcome);
      const scorers = [...(m.goals1 || []), ...(m.goals2 || [])]
        .map((g) => g.name)
        .filter(Boolean);
      whyItMatters = scorers.length
        ? `Scorers: ${scorers.join(', ')}.`
        : `Full-time ${outcome.final[0]}–${outcome.final[1]}${m.ground ? ` at ${m.ground}` : ''}.`;
      impactScore = Math.min(0.78, 0.52 + Math.abs(outcome.final[0] - outcome.final[1]) * 0.05);
    } else {
      title = `${t1} vs ${t2}`;
      description = `${lane} fixture: ${t1} vs ${t2}, ${dd}${m.ground ? ` at ${m.ground}` : ''}.`;
      whyItMatters = `Upcoming ${lane} match.`;
      impactScore = 0.5;
    }

    const ev = {
      id,
      title,
      description,
      yearNum: 2026,
      yearLabel: '2026',
      precision: 'day',
      domains: ['culture', 'systems'],
      impactScore,
      tags: ['world-cup-2026', slug(lane), slug(t1), slug(t2)],
      date: m.date,
      dateLabel: dd,
      status: played ? 'completed' : 'scheduled',
      entities: [t1, t2, lane],
      whyItMatters,
      sources: [SOURCE],
      sourceMatchId: sourceMatchId(m),
      ...(n != null ? { matchNumber: n, matchKey: matchKey(n) } : {}),
      ...(m.ground ? { venue: m.ground } : {}),
      ...(m.time ? { kickoff: m.time } : {}),
      ...(outcome ? { result: outcome } : {}),
    };
    pairs.push({ ev, m, outcome });
  }
  return pairs;
}

// Sparse mechanical links remain deliberately conservative. Editorial links win
// on duplicate ordered pairs later in the merge.
function buildLinks(pairs) {
  const byTeam = {};
  for (const p of pairs) {
    for (const t of [p.m.team1, p.m.team2]) {
      if (isPlaceholderTeam(t)) continue;
      (byTeam[t] = byTeam[t] || []).push(p);
    }
  }
  for (const t in byTeam) byTeam[t].sort((a, b) => a.m.date.localeCompare(b.m.date));

  const links = [];
  const ids = new Set();
  for (const p of pairs) {
    if (!p.outcome) continue;
    const [a, b] = p.outcome.final;
    const margin = Math.abs(a - b);
    const winner = outcomeWinner(p.m.team1, p.m.team2, p.outcome);
    if (!winner || margin < 3) continue;

    const hi = Math.max(a, b);
    const lo = Math.min(a, b);
    const seq = byTeam[winner];
    const i = seq.indexOf(p);
    const next = seq[i + 1];
    if (!next) continue;
    const nextOpp = next.m.team1 === winner ? next.m.team2 : next.m.team1;
    if (isPlaceholderTeam(nextOpp)) continue;

    const id = `${p.ev.id}--accelerated-->${next.ev.id}`;
    if (ids.has(id)) continue;
    ids.add(id);
    links.push({
      id,
      fromEvent: p.ev.id,
      toEvent: next.ev.id,
      relationship: 'accelerated',
      confidence: 0.62,
      evidence: `${winner}'s ${hi}–${lo} win banked a goal-difference cushion heading into ${winner} vs ${nextOpp}.`,
    });
  }
  return links;
}

function buildInsights(links) {
  if (!links.length) return [];
  return [{
    id: 'pattern--statement-win',
    pattern: 'Statement Win Creates Momentum and Goal-Difference Cushion',
    description: 'A large-margin win generates both a practical goal-difference advantage and narrative momentum that carries into the next fixture.',
    instances: links.map((l) => l.id),
    predictiveValue: 0.7,
    domains: ['culture', 'systems'],
  }];
}

function eventRound(event) {
  const entities = Array.isArray(event?.entities) ? event.entities : [];
  const candidate = entities.find((x) => /group|round|quarter|semi|final|third/i.test(String(x)));
  return norm(candidate);
}

function venueMatches(event, m) {
  if (!m.ground) return false;
  if (norm(event?.venue) === norm(m.ground)) return true;
  return norm(event?.description).includes(norm(m.ground));
}

function candidateScore(event, fresh, m) {
  if (!event || !event.status) return 0;
  const freshN = asMatchNumber(fresh.matchNumber);
  const eventN = asMatchNumber(event.matchNumber);
  if (freshN != null && eventN === freshN) return 120;
  if (event.sourceMatchId && event.sourceMatchId === fresh.sourceMatchId) return 115;
  if (event.id === fresh.id) return 110;
  if (event.date === fresh.date && eventTeamPair(event) && eventTeamPair(event) === eventTeamPair(fresh)) return 90;
  if (
    isPlaceholderEvent(event)
    && event.date === fresh.date
    && eventRound(event) === norm(m.group || m.round || 'Knockouts')
    && venueMatches(event, m)
  ) return 80;
  return 0;
}

function editorialRichness(event) {
  let score = 0;
  if (!event) return score;
  if (!isPlaceholderEvent(event)) score += 10;
  if (event.whyItMatters && !isTemplatedWhy(event.whyItMatters)) score += 8;
  score += Math.min(5, Array.isArray(event.nextWatchpoints) ? event.nextWatchpoints.length : 0);
  score += Math.min(3, Array.isArray(event.sources) ? event.sources.length : 0);
  if (event.whyItMatters_vi) score += 2;
  if (Array.isArray(event.nextWatchpoints_vi) && event.nextWatchpoints_vi.length) score += 2;
  return score;
}

function shouldMigrateId(existing, fresh) {
  if (!existing) return false;
  if (isPlaceholderEvent(existing) && !isPlaceholderEvent(fresh)) return true;
  const oldPair = eventTeamPair(existing);
  const newPair = eventTeamPair(fresh);
  return asMatchNumber(existing.matchNumber) != null && oldPair && newPair && oldPair !== newPair;
}

function mergeEvent(existing, fresh, duplicates = []) {
  for (const candidate of [existing, ...duplicates]) {
    if (candidate) assertNoIndependentFactConflict(candidate, fresh);
  }
  if (!existing) return {
    ...fresh,
    sources: mergeSources(...duplicates.map((e) => e.sources), fresh.sources),
  };

  const merged = { ...existing };
  for (const k of INGEST_OWNED) {
    if (fresh[k] !== undefined) merged[k] = fresh[k];
    else delete merged[k];
  }

  const existingIsPlaceholder = isPlaceholderEvent(existing);
  const freshIsResolved = !isPlaceholderEvent(fresh);
  if (
    !existing.description
    || /^\w[\w '&-]* (?:beat|lost to|drew) /.test(existing.description)
    || /fixture:/.test(existing.description)
    || (existingIsPlaceholder && freshIsResolved)
  ) {
    merged.description = fresh.description;
  }

  if (
    !existing.whyItMatters
    || isTemplatedWhy(existing.whyItMatters)
    || /\b(?:W|L)\d+\b/i.test(String(existing.whyItMatters))
  ) {
    merged.whyItMatters = fresh.whyItMatters;
    delete merged.whyItMatters_vi;
    delete merged.nextWatchpoints_vi;
  }

  if (existingIsPlaceholder && freshIsResolved) {
    merged.entities = fresh.entities;
  } else if (Array.isArray(existing.entities) && existing.entities.length >= (fresh.entities?.length ?? 0)) {
    merged.entities = existing.entities;
  } else {
    merged.entities = fresh.entities;
  }

  const inheritedTags = [existing, ...duplicates]
    .flatMap((e) => Array.isArray(e?.tags) ? e.tags : [])
    .filter((tag) => !(freshIsResolved && /^(?:w|l)\d+$/i.test(String(tag))));
  merged.tags = [...new Set([...inheritedTags, ...(fresh.tags || [])])];
  merged.sources = mergeSources(
    existing.sources,
    ...duplicates.map((e) => e.sources),
    fresh.sources,
  );

  merged.impactScore = typeof existing.impactScore === 'number'
    && existing.impactScore !== 0.5
    && existing.impactScore !== 0.6
    ? existing.impactScore
    : fresh.impactScore;

  return merged;
}

function resolveAlias(id, aliases) {
  let current = id;
  const seen = new Set();
  while (aliases.has(current) && !seen.has(current)) {
    seen.add(current);
    current = aliases.get(current);
  }
  return current;
}

const matches = await loadMatches();
const pairs = buildEvents(matches);
const freshLinks = buildLinks(pairs);

const priorEvents = readJsonIfExists(join(OUT, 'events.json'), []);
const priorLinks = readJsonIfExists(join(OUT, 'links.json'), []);
const priorInsights = readJsonIfExists(join(OUT, 'insights.json'), []);

// Reconcile by stable match identity first, then exact id/team pair, then a
// placeholder's schedule slot (date + round + venue). This removes W91/W92-style
// ghosts when the upstream feed resolves participants.
const consumedPriorIds = new Set();
const aliases = new Map();
const reconciledEvents = [];

for (const pair of pairs) {
  const { ev: fresh, m } = pair;
  const candidates = priorEvents
    .filter((event) => !consumedPriorIds.has(event.id))
    .map((event) => ({ event, score: candidateScore(event, fresh, m) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || editorialRichness(b.event) - editorialRichness(a.event));

  const exact = candidates.find((x) => x.event.id === fresh.id)?.event;
  const primary = exact || candidates[0]?.event || null;
  const duplicateEvents = candidates.map((x) => x.event).filter((e) => e !== primary);
  let canonicalId = primary?.id || fresh.id;
  if (!primary || shouldMigrateId(primary, fresh)) canonicalId = fresh.id;

  const merged = mergeEvent(primary, fresh, duplicateEvents);
  merged.id = canonicalId;
  const legacyIds = new Set(Array.isArray(merged.legacyIds) ? merged.legacyIds : []);

  for (const candidate of candidates.map((x) => x.event)) {
    consumedPriorIds.add(candidate.id);
    if (candidate.id !== canonicalId) {
      aliases.set(candidate.id, canonicalId);
      legacyIds.add(candidate.id);
    }
  }
  if (fresh.id !== canonicalId) aliases.set(fresh.id, canonicalId);
  if (legacyIds.size) merged.legacyIds = [...legacyIds].filter((id) => id !== canonicalId).sort();
  reconciledEvents.push(merged);
}

// Preserve static lineage and editorial events not represented by the feed.
for (const event of priorEvents) {
  if (!consumedPriorIds.has(event.id)) reconciledEvents.push(event);
}

const eventsById = new Map();
for (const event of reconciledEvents) {
  if (eventsById.has(event.id)) {
    throw new Error(`duplicate canonical event id after reconciliation: ${event.id}`);
  }
  eventsById.set(event.id, event);
}
const events = [...eventsById.values()];

function remapLink(link) {
  const fromEvent = resolveAlias(link.fromEvent, aliases);
  const toEvent = resolveAlias(link.toEvent, aliases);
  const id = `${fromEvent}--${link.relationship}-->${toEvent}`;
  return { ...link, id, fromEvent, toEvent };
}

const finalLinks = [];
const linkIds = new Set();
const orderedPairs = new Set();
const linkAliases = new Map();
let addedLinks = 0;

// Curated links are considered first, so the mechanical layer cannot replace one.
for (const original of [...priorLinks, ...freshLinks]) {
  const link = remapLink(original);
  if (original.id !== link.id) linkAliases.set(original.id, link.id);
  const pairKey = `${link.fromEvent}>${link.toEvent}`;
  if (linkIds.has(link.id) || orderedPairs.has(pairKey)) continue;
  if (!eventsById.has(link.fromEvent) || !eventsById.has(link.toEvent)) continue;
  finalLinks.push(link);
  linkIds.add(link.id);
  orderedPairs.add(pairKey);
  if (freshLinks.includes(original)) addedLinks++;
}

let finalInsights = priorInsights
  .map((insight) => ({
    ...insight,
    instances: [...new Set((insight.instances || []).map((id) => linkAliases.get(id) || id))]
      .filter((id) => linkIds.has(id)),
  }))
  .filter((insight) => insight.instances.length > 0);
if (finalInsights.length === 0 && addedLinks) finalInsights = buildInsights(finalLinks);

const errors = validatePackData({ events, links: finalLinks, insights: finalInsights }, 'worldcup-2026');
if (errors.length) {
  console.error(`✗ ${errors.length} structural error(s) — nothing written:`);
  for (const e of errors.slice(0, 30)) console.error('  - ' + e);
  process.exit(1);
}

const { warnings: qWarnings, errors: qErrors, stats } = assessCausalQuality(
  { events, links: finalLinks, insights: finalInsights },
  'worldcup-2026',
);
if (qErrors.length) {
  console.warn(`! causal-quality: ${qErrors.length} issue(s) remain after ingest (the editorial pass must resolve these before publish):`);
  for (const w of qErrors.slice(0, 8)) console.warn('  - ' + w);
}
for (const w of qWarnings.slice(0, 4)) console.warn('  ! ' + w);

const write = (n, d) => writeFileSync(join(OUT, n), JSON.stringify(d, null, 2) + '\n');
write('events.json', events);
write('links.json', finalLinks);
write('insights.json', finalInsights);
const played = events.filter((e) => e.status === 'completed').length;
console.log(`✓ worldcup-2026 (reconciled): ${events.length} events (${played} played, ${events.length - played} upcoming, ${stats.lineage} lineage), ${finalLinks.length} links (${addedLinks} added by ingest), ${finalInsights.length} insights`);
console.log(`  preserved from prior: ${priorEvents.length} events, ${priorLinks.length} links, ${priorInsights.length} insights`);
console.log(`  reconciled aliases: ${aliases.size}`);
