#!/usr/bin/env node
// Add a match-day to a live pack — deterministically and safely.
//
// The daily updater (scheduled Codex job or a human) supplies a small input file
// describing the day's results + new fixtures + causal links. This script does the
// mechanical, error-prone parts (id wiring, status flips, defaults) and — crucially —
// validates the WHOLE pack in memory and refuses to write if anything is broken.
// It also enforces the honesty rule: every completed result must cite a source.
//
//   node scripts/add-match-day.mjs <input.json> [packId=worldcup-2026]
//
// Exit 0 = pack updated + valid. Exit 1 = nothing written (see printed errors).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePackData } from './validate-pack.mjs';
import { assessCausalQuality } from './causal-quality.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (e) { die(`cannot read ${path}: ${e.message}`); }
}
function readOptional(path) { return existsSync(path) ? readJson(path) : undefined; }

const inputPath = process.argv[2];
const packId = process.argv[3] || 'worldcup-2026';
if (!inputPath) die('usage: node scripts/add-match-day.mjs <input.json> [packId]');

const packDir = join(ROOT, 'packs', packId);
const eventsPath = join(packDir, 'events.json');
const linksPath = join(packDir, 'links.json');
const insightsPath = join(packDir, 'insights.json');
const manifestPath = join(packDir, 'manifest.json');
const baselinePath = join(packDir, 'quality-baseline.json');

const events = readJson(eventsPath);
const links = readJson(linksPath);
const insights = readJson(insightsPath);
const manifest = readOptional(manifestPath);
const qualityBaseline = readOptional(baselinePath);
const input = readJson(inputPath);

const eventsById = new Map(events.map((e) => [e.id, e]));
const linkIds = new Set(links.map((l) => l.id));
const insightsById = new Map(insights.map((i) => [i.id, i]));

const DEFAULTS = { domains: ['culture', 'systems'], precision: 'day', yearNum: 2026, yearLabel: '2026', impactScore: 0.6, tags: [] };
const topDate = input.date;
const topDateLabel = input.dateLabel;

function upsertEvent(src, status) {
  if (!src.id) die('an event in input has no id');
  const existing = eventsById.get(src.id) || {};
  const ev = {
    ...DEFAULTS,
    ...existing,
    ...src,
    status,
    date: src.date || existing.date || topDate,
    dateLabel: src.dateLabel || existing.dateLabel || topDateLabel,
  };
  if (!ev.date) die(`event ${src.id}: no date (set input.date or per-event date)`);
  eventsById.set(ev.id, ev);
}

// 1) Completed results — honesty gate: each MUST carry a source.
for (const result of input.results || []) {
  if (!Array.isArray(result.sources) || result.sources.length === 0) {
    die(`result ${result.id || '<no id>'}: a completed result requires a non-empty "sources" citation (honesty rule)`);
  }
  upsertEvent(result, 'completed');
}

// 2) New upcoming fixtures.
for (const scheduled of input.scheduled || []) upsertEvent(scheduled, 'scheduled');

// 3) Causal links (event -> event). Id is derived; dupes skipped.
for (const link of input.links || []) {
  if (!link.fromEvent || !link.toEvent || !link.relationship) die('a link is missing fromEvent/toEvent/relationship');
  const id = `${link.fromEvent}--${link.relationship}-->${link.toEvent}`;
  if (linkIds.has(id)) continue;
  links.push({ id, fromEvent: link.fromEvent, toEvent: link.toEvent, relationship: link.relationship, confidence: link.confidence, evidence: link.evidence });
  linkIds.add(id);
}

// 4) Attach links to insight patterns (dedup) or add whole new insights.
for (const update of input.insightInstances || []) {
  const insight = insightsById.get(update.insightId);
  if (!insight) die(`insightInstances: unknown insight "${update.insightId}"`);
  const set = new Set(insight.instances);
  for (const linkId of update.addLinkIds || []) set.add(linkId);
  insight.instances = [...set];
}
for (const newInsight of input.newInsights || []) {
  if (insightsById.has(newInsight.id)) die(`newInsights: insight "${newInsight.id}" already exists`);
  insights.push(newInsight);
  insightsById.set(newInsight.id, newInsight);
}

const merged = { events: [...eventsById.values()], links, insights };

// 5a) Structural validation — ids resolve, enums are valid, references are intact.
const errors = validatePackData(merged, packId);
if (errors.length > 0) {
  console.error(`✗ ${errors.length} validation error(s) — nothing written:`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

// 5b) Profile-aware causal-quality gate. The pack manifest selects domain rules;
// an exact quality baseline can temporarily downgrade known debt while new debt fails.
const profile = manifest?.quality?.causalProfile || (packId === 'worldcup-2026' ? 'sports-live' : 'generic');
const { errors: qualityErrors, warnings: qualityWarnings } = assessCausalQuality(merged, packId, {
  profile,
  baseline: qualityBaseline,
});
for (const warning of qualityWarnings) console.warn(`  ! ${warning}`);
if (qualityErrors.length > 0) {
  console.error(`✗ ${qualityErrors.length} causal-quality error(s) — nothing written:`);
  for (const error of qualityErrors) console.error(`  - ${error}`);
  process.exit(1);
}

const write = (path, data) => writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
write(eventsPath, merged.events);
write(linksPath, merged.links);
write(insightsPath, merged.insights);

console.log(`✓ ${packId} updated: ${merged.events.length} events, ${merged.links.length} links, ${merged.insights.length} insights`);
console.log(`  Quality profile: ${profile}. Review the diff, then commit; CI re-validates on push.`);
