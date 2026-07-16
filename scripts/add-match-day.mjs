#!/usr/bin/env node
// Add a match-day to a live pack deterministically and safely.
// Human/agent inputs may enrich the same match from additional sources, but a
// stable matchNumber is used to reconcile identity and factual conflicts fail
// closed unless an explicit reviewed correction is supplied.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePackData } from './validate-pack.mjs';
import { assessCausalQuality } from './causal-quality.mjs';
import {
  asMatchNumber,
  factFingerprint,
  matchKey,
  mergeSources,
} from './worldcup-facts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (e) { die(`cannot read ${path}: ${e.message}`); }
}

const inputPath = process.argv[2];
const packId = process.argv[3] || 'worldcup-2026';
if (!inputPath) die('usage: node scripts/add-match-day.mjs <input.json> [packId]');

const packDir = join(ROOT, 'packs', packId);
const eventsPath = join(packDir, 'events.json');
const linksPath = join(packDir, 'links.json');
const insightsPath = join(packDir, 'insights.json');

const events = readJson(eventsPath);
const links = readJson(linksPath);
const insights = readJson(insightsPath);
const input = readJson(inputPath);

const eventsById = new Map(events.map((e) => [e.id, e]));
const eventsByMatchNumber = new Map();
for (const event of events) {
  const n = asMatchNumber(event.matchNumber);
  if (n == null) continue;
  if (eventsByMatchNumber.has(n)) die(`pack already contains duplicate matchNumber ${n}`);
  eventsByMatchNumber.set(n, event);
}
const linkIds = new Set(links.map((l) => l.id));
const insightsById = new Map(insights.map((i) => [i.id, i]));
const aliases = new Map();

const DEFAULTS = {
  domains: ['culture', 'systems'],
  precision: 'day',
  yearNum: 2026,
  yearLabel: '2026',
  impactScore: 0.6,
  tags: [],
};
const topDate = input.date;
const topDateLabel = input.dateLabel;

function looksLikeKnockout(src) {
  const text = [src.title, ...(Array.isArray(src.entities) ? src.entities : [])].join(' ');
  return /round of 32|round of 16|quarter|semi|final|third place/i.test(text);
}

function assertCompatibleFacts(existing, incoming) {
  if (!existing) return;
  const oldFact = factFingerprint(existing);
  const newFact = factFingerprint(incoming);
  if (!oldFact || !newFact || oldFact === newFact) return;
  const correction = incoming.factCorrection;
  if (!correction || !String(correction.reason ?? '').trim()) {
    die(`result conflict for ${incoming.matchNumber ? `match ${incoming.matchNumber}` : incoming.id}: existing and incoming facts differ; add factCorrection.reason only after manual source review`);
  }
}

function upsertEvent(src, status) {
  if (!src.id) die('an event in input has no id');
  const n = asMatchNumber(src.matchNumber);
  if (packId === 'worldcup-2026' && looksLikeKnockout(src) && n == null) {
    die(`event ${src.id}: knockout fixtures/results require matchNumber so W91-style placeholders reconcile safely`);
  }

  const byNumber = n == null ? null : eventsByMatchNumber.get(n);
  const byId = eventsById.get(src.id);
  if (byNumber && byId && byNumber.id !== byId.id) {
    die(`event ${src.id}: id and matchNumber ${n} point to different existing events`);
  }
  const existing = byNumber || byId || null;
  const canonicalId = existing?.id || src.id;
  if (src.id !== canonicalId) aliases.set(src.id, canonicalId);

  const candidate = {
    ...DEFAULTS,
    ...(existing || {}),
    ...src,
    id: canonicalId,
    status,
    date: src.date || existing?.date || topDate,
    dateLabel: src.dateLabel || existing?.dateLabel || topDateLabel,
    sources: mergeSources(existing?.sources, src.sources),
    ...(n != null ? { matchNumber: n, matchKey: matchKey(n) } : {}),
  };
  if (!candidate.date) die(`event ${src.id}: no date (set input.date or per-event date)`);
  assertCompatibleFacts(existing, candidate);
  delete candidate.factCorrection;

  if (existing && existing.id !== candidate.id) eventsById.delete(existing.id);
  eventsById.set(candidate.id, candidate);
  if (n != null) eventsByMatchNumber.set(n, candidate);
}

// Completed facts require citations. An AI-generated recap is not itself a score source.
for (const result of input.results || []) {
  if (!Array.isArray(result.sources) || result.sources.length === 0) {
    die(`result ${result.id || '<no id>'}: a completed result requires a non-empty "sources" citation`);
  }
  upsertEvent(result, 'completed');
}

for (const scheduled of input.scheduled || []) upsertEvent(scheduled, 'scheduled');

const resolveAlias = (id) => aliases.get(id) || id;
for (const sourceLink of input.links || []) {
  if (!sourceLink.fromEvent || !sourceLink.toEvent || !sourceLink.relationship) {
    die('a link is missing fromEvent/toEvent/relationship');
  }
  const fromEvent = resolveAlias(sourceLink.fromEvent);
  const toEvent = resolveAlias(sourceLink.toEvent);
  const id = `${fromEvent}--${sourceLink.relationship}-->${toEvent}`;
  if (linkIds.has(id)) continue;
  links.push({
    id,
    fromEvent,
    toEvent,
    relationship: sourceLink.relationship,
    confidence: sourceLink.confidence,
    evidence: sourceLink.evidence,
  });
  linkIds.add(id);
}

for (const update of input.insightInstances || []) {
  const insight = insightsById.get(update.insightId);
  if (!insight) die(`insightInstances: unknown insight "${update.insightId}"`);
  const set = new Set(insight.instances);
  for (const rawId of update.addLinkIds || []) {
    const link = links.find((l) => l.id === rawId);
    if (link) set.add(rawId);
  }
  insight.instances = [...set];
}
for (const newInsight of input.newInsights || []) {
  if (insightsById.has(newInsight.id)) die(`newInsights: insight "${newInsight.id}" already exists`);
  insights.push(newInsight);
  insightsById.set(newInsight.id, newInsight);
}

const merged = { events: [...eventsById.values()], links, insights };
const errors = validatePackData(merged, packId);
if (errors.length > 0) {
  console.error(`✗ ${errors.length} validation error(s) — nothing written:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

const { errors: qErrors, warnings: qWarnings } = assessCausalQuality(merged, packId);
for (const w of qWarnings) console.warn(`  ! ${w}`);
if (qErrors.length > 0) {
  console.error(`✗ ${qErrors.length} causal-quality error(s) — nothing written:`);
  for (const e of qErrors) console.error(`  - ${e}`);
  process.exit(1);
}

const write = (path, data) => writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
write(eventsPath, merged.events);
write(linksPath, merged.links);
write(insightsPath, merged.insights);

console.log(`✓ ${packId} updated: ${merged.events.length} events, ${merged.links.length} links, ${merged.insights.length} insights`);
console.log(`  reconciled aliases: ${aliases.size}`);
console.log('  Review the diff, then commit. CI re-validates on push.');
