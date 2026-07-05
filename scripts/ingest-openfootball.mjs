#!/usr/bin/env node
// Ingest the REAL World Cup 2026 schedule + results from openfootball (public
// domain, no API key) and MERGE them into the worldcup-2026 pack. Every fixture
// becomes an event with an openfootball source citation; the ingest owns ONLY the
// mechanical facts (title, scoreline, date, status). It MERGES rather than
// overwrites, so the curated causal layer — real whyItMatters, nextWatchpoints,
// typed links, the 160-year lineage, curated insights — SURVIVES the daily run.
// Validates in memory (structure + causal quality); writes nothing on error.
//
//   node scripts/ingest-openfootball.mjs           # fetch live + merge into pack
//   node scripts/ingest-openfootball.mjs <file.json>   # use a local snapshot
//
// Run daily (see .github/workflows/ingest.yml) so the pack tracks the tournament.
//
// ── MERGE CONTRACT (why this stopped clobbering the causal graph) ────────────
// For an event the ingest already knows (same id), it refreshes ONLY the fields
// openfootball is authoritative for (title/description-if-thin/date/status/
// impactScore) and PRESERVES any curated fields already on disk (a real
// whyItMatters, nextWatchpoints, richer entities, extra tags). It NEVER deletes
// events it didn't create — the history-spine lineage and any editorially-added
// events stay. Links + insights already on disk are preserved and de-duplicated;
// the ingest only ADDS its own mechanical links when a curated one isn't present.
// See docs/CAUSAL-CONTRACT.md for the editorial quality bar the daily process must meet.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePackData } from './validate-pack.mjs';
import { assessCausalQuality } from './causal-quality.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'packs', 'worldcup-2026');
const SRC = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';
const SOURCE = { type: 'open-data', citation: 'openfootball/worldcup.json (public domain)', url: 'https://github.com/openfootball/worldcup.json' };
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Fields openfootball is authoritative for and may refresh on an existing event.
// Everything else already on disk (curated whyItMatters, nextWatchpoints, extra
// entities/tags, kickoff) is PRESERVED — that is the whole point of the merge.
const INGEST_OWNED = new Set(['title', 'date', 'dateLabel', 'status', 'yearNum', 'yearLabel', 'precision', 'sources']);
// A whyItMatters that matches these is mechanical — safe for the ingest to replace
// with its own fallback (or leave for the editorial pass to enrich). A NON-templated
// whyItMatters is curated and must never be overwritten.
const TEMPLATED_WHY = [/^scorers:/i, /^full-time\s+\d/i, /^upcoming\s+.*match/i];
const isTemplatedWhy = (w) => TEMPLATED_WHY.some((re) => re.test(String(w ?? '')));

function readJsonIfExists(path, fallback) {
  if (!existsSync(path)) return fallback;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return fallback; }
}

const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const dateLabel = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; };

async function loadMatches() {
  const arg = process.argv[2];
  if (arg) return JSON.parse(readFileSync(arg, 'utf8')).matches;
  const res = await fetch(SRC);
  if (!res.ok) throw new Error(`fetch ${SRC} -> ${res.status}`);
  return (await res.json()).matches;
}

function buildEvents(matches) {
  const pairs = [];
  const seen = new Set();
  for (const m of matches) {
    const t1 = m.team1, t2 = m.team2, lane = m.group || m.round || 'Knockouts';
    let id = `wc2026-${slug(t1)}-${slug(t2)}-${m.date.slice(5).replace('-', '')}`;
    while (seen.has(id)) id += 'x';
    seen.add(id);
    const played = !!(m.score && m.score.ft);
    const dd = dateLabel(m.date);
    let title, description, whyItMatters, impactScore;
    if (played) {
      const [a, b] = m.score.ft;
      title = `${t1} ${a}–${b} ${t2}`;
      const verb = a > b ? 'beat' : (b > a ? 'lost to' : 'drew');
      description = `${t1} ${verb} ${t2} ${a}–${b} in ${lane}.`;
      const scorers = [...(m.goals1 || []), ...(m.goals2 || [])].map((g) => g.name).filter(Boolean);
      whyItMatters = scorers.length ? `Scorers: ${scorers.join(', ')}.` : `Full-time ${a}–${b}${m.ground ? ` at ${m.ground}` : ''}.`;
      impactScore = Math.min(0.78, 0.52 + Math.abs(a - b) * 0.05);
    } else {
      title = `${t1} vs ${t2}`;
      description = `${lane} fixture: ${t1} vs ${t2}, ${dd}${m.ground ? ` at ${m.ground}` : ''}.`;
      whyItMatters = `Upcoming ${lane} match.`;
      impactScore = 0.5;
    }
    const ev = {
      id, title, description, yearNum: 2026, yearLabel: '2026', precision: 'day',
      domains: ['culture', 'systems'], impactScore,
      tags: ['world-cup-2026', slug(lane), slug(t1), slug(t2)],
      date: m.date, dateLabel: dd, status: played ? 'completed' : 'scheduled',
      entities: [t1, t2, lane], whyItMatters, sources: [SOURCE],
    };
    pairs.push({ ev, m });
  }
  return pairs;
}

// Sparse causal layer: a large-margin win "accelerated" the winner's next fixture.
function buildLinks(pairs) {
  const byTeam = {};
  for (const p of pairs) for (const t of [p.m.team1, p.m.team2]) (byTeam[t] = byTeam[t] || []).push(p);
  for (const t in byTeam) byTeam[t].sort((a, b) => a.m.date.localeCompare(b.m.date));
  const links = []; const ids = new Set();
  for (const p of pairs) {
    if (!(p.m.score && p.m.score.ft)) continue;
    const [a, b] = p.m.score.ft; const margin = Math.abs(a - b);
    if (margin < 3) continue;
    const winner = a > b ? p.m.team1 : p.m.team2;
    // Report the WINNER's own margin (higher–lower), never the raw team1–team2
    // pair — otherwise a team2 win prints as e.g. "Mexico's 0–3 win" (the live bug).
    const hi = Math.max(a, b), lo = Math.min(a, b);
    const seq = byTeam[winner];
    const i = seq.indexOf(p);
    const next = seq[i + 1];
    if (!next) continue;
    const nextOpp = next.m.team1 === winner ? next.m.team2 : next.m.team1;
    const id = `${p.ev.id}--accelerated-->${next.ev.id}`;
    if (ids.has(id)) continue; ids.add(id);
    links.push({
      id, fromEvent: p.ev.id, toEvent: next.ev.id, relationship: 'accelerated', confidence: 0.62,
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
    predictiveValue: 0.7, domains: ['culture', 'systems'],
  }];
}

// ── Merge an ingest event onto whatever curated event is already on disk ──────
// Refresh only the fields openfootball owns; preserve every curated field. A
// templated whyItMatters is refreshed; a curated one is kept. Curated entities /
// tags / nextWatchpoints / kickoff survive untouched.
function mergeEvent(existing, fresh) {
  if (!existing) return fresh;                       // brand-new fixture
  const merged = { ...existing };
  for (const k of INGEST_OWNED) if (fresh[k] !== undefined) merged[k] = fresh[k];
  // description: only refresh if the curated one is missing or still the ingest stub.
  if (!existing.description || /^\w[\w '&-]* (?:beat|lost to|drew) /.test(existing.description) || /fixture:/.test(existing.description)) {
    merged.description = fresh.description;
  }
  // whyItMatters: replace ONLY if the existing one is templated/empty.
  if (!existing.whyItMatters || isTemplatedWhy(existing.whyItMatters)) merged.whyItMatters = fresh.whyItMatters;
  // entities: keep the richer set (curated may add a venue / round label).
  if (Array.isArray(existing.entities) && existing.entities.length >= (fresh.entities?.length ?? 0)) {
    merged.entities = existing.entities;
  } else {
    merged.entities = fresh.entities;
  }
  // impactScore: keep a curated (non-default) score, else take the ingest's margin-based one.
  merged.impactScore = typeof existing.impactScore === 'number' && existing.impactScore !== 0.5 && existing.impactScore !== 0.6
    ? existing.impactScore : fresh.impactScore;
  return merged;
}

const matches = await loadMatches();
const pairs = buildEvents(matches);
const freshEvents = pairs.map((p) => p.ev);
const freshLinks = buildLinks(pairs);

// Load the curated pack already on disk (the causal substrate to PRESERVE).
const priorEvents = readJsonIfExists(join(OUT, 'events.json'), []);
const priorLinks = readJsonIfExists(join(OUT, 'links.json'), []);
const priorInsights = readJsonIfExists(join(OUT, 'insights.json'), []);

// 1) Events: merge fresh onto prior by id; keep every prior event the ingest
//    didn't touch (history-spine lineage + editorially-added events).
const freshById = new Map(freshEvents.map((e) => [e.id, e]));
const priorById = new Map(priorEvents.map((e) => [e.id, e]));
const mergedEventsById = new Map();
for (const e of priorEvents) mergedEventsById.set(e.id, e);       // preserve all prior
for (const e of freshEvents) mergedEventsById.set(e.id, mergeEvent(priorById.get(e.id), e));
const events = [...mergedEventsById.values()];

// 2) Links: keep every prior (curated) link; add a fresh mechanical link ONLY if
//    no link already connects that ordered pair (don't fight the editorial layer).
const priorPairs = new Set(priorLinks.map((l) => `${l.fromEvent}>${l.toEvent}`));
const priorLinkIds = new Set(priorLinks.map((l) => l.id));
const addedLinks = freshLinks.filter((l) => !priorLinkIds.has(l.id) && !priorPairs.has(`${l.fromEvent}>${l.toEvent}`));
const links = [...priorLinks, ...addedLinks];

// 3) Insights: preserve curated insights. Only seed the mechanical statement-win
//    pattern if the pack has NO insights at all (a fresh pack), and never wipe curated ones.
let insights = priorInsights;
if (insights.length === 0 && addedLinks.length) insights = buildInsights(addedLinks);

// 4) Drop any link whose endpoints no longer resolve (safety after the merge).
const eventIdSet = new Set(events.map((e) => e.id));
const finalLinks = links.filter((l) => eventIdSet.has(l.fromEvent) && eventIdSet.has(l.toEvent));
// 5) Drop insight instances pointing at links that no longer exist.
const linkIdSet = new Set(finalLinks.map((l) => l.id));
const finalInsights = insights
  .map((i) => ({ ...i, instances: (i.instances || []).filter((id) => linkIdSet.has(id)) }))
  .filter((i) => i.instances.length > 0);

// Structural validation is a HARD gate (never write a broken graph).
const errors = validatePackData({ events, links: finalLinks, insights: finalInsights }, 'worldcup-2026');
if (errors.length) {
  console.error(`✗ ${errors.length} structural error(s) — nothing written:`);
  for (const e of errors.slice(0, 30)) console.error('  - ' + e);
  process.exit(1);
}

// Causal-quality is a WARNING here (the ingest alone can't produce varied links);
// it is HARD-enforced in add-match-day.mjs and CI where the editorial pass runs.
const { warnings: qWarnings, errors: qErrors, stats } = assessCausalQuality(
  { events, links: finalLinks, insights: finalInsights }, 'worldcup-2026');
if (qErrors.length) {
  console.warn(`! causal-quality: ${qErrors.length} issue(s) remain after ingest (the daily editorial pass must resolve these before publish):`);
  for (const w of qErrors.slice(0, 8)) console.warn('  - ' + w);
}
for (const w of qWarnings.slice(0, 4)) console.warn('  ! ' + w);

const write = (n, d) => writeFileSync(join(OUT, n), JSON.stringify(d, null, 2) + '\n');
write('events.json', events); write('links.json', finalLinks); write('insights.json', finalInsights);
const played = events.filter((e) => e.status === 'completed').length;
console.log(`✓ worldcup-2026 (merged): ${events.length} events (${played} played, ${events.length - played} upcoming, ${stats.lineage} lineage), ${finalLinks.length} links (${addedLinks.length} added by ingest), ${finalInsights.length} insights`);
console.log(`  preserved from prior: ${priorEvents.length} events, ${priorLinks.length} links, ${priorInsights.length} insights`);
