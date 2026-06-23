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

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePackData } from './validate-pack.mjs';

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
const linkIds = new Set(links.map((l) => l.id));
const insightsById = new Map(insights.map((i) => [i.id, i]));

const DEFAULTS = { domains: ['culture', 'systems'], precision: 'day', yearNum: 2026, yearLabel: '2026', impactScore: 0.6, tags: [] };
const topDate = input.date;
const topDateLabel = input.dateLabel;

function upsertEvent(src, status) {
  if (!src.id) die(`an event in input has no id`);
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
for (const r of input.results || []) {
  if (!Array.isArray(r.sources) || r.sources.length === 0) {
    die(`result ${r.id || '<no id>'}: a completed result requires a non-empty "sources" citation (honesty rule)`);
  }
  upsertEvent(r, 'completed');
}

// 2) New upcoming fixtures.
for (const s of input.scheduled || []) upsertEvent(s, 'scheduled');

// 3) Causal links (event -> event). Id is derived; dupes skipped.
for (const l of input.links || []) {
  if (!l.fromEvent || !l.toEvent || !l.relationship) die(`a link is missing fromEvent/toEvent/relationship`);
  const id = `${l.fromEvent}--${l.relationship}-->${l.toEvent}`;
  if (linkIds.has(id)) continue;
  links.push({ id, fromEvent: l.fromEvent, toEvent: l.toEvent, relationship: l.relationship, confidence: l.confidence, evidence: l.evidence });
  linkIds.add(id);
}

// 4) Attach links to insight patterns (dedup) or add whole new insights.
for (const u of input.insightInstances || []) {
  const ins = insightsById.get(u.insightId);
  if (!ins) die(`insightInstances: unknown insight "${u.insightId}"`);
  const set = new Set(ins.instances);
  for (const lid of u.addLinkIds || []) set.add(lid);
  ins.instances = [...set];
}
for (const ni of input.newInsights || []) {
  if (insightsById.has(ni.id)) die(`newInsights: insight "${ni.id}" already exists`);
  insights.push(ni);
  insightsById.set(ni.id, ni);
}

const merged = { events: [...eventsById.values()], links, insights };

// 5) Validate BEFORE writing. Nothing is written if invalid.
const errors = validatePackData(merged, packId);
if (errors.length > 0) {
  console.error(`✗ ${errors.length} validation error(s) — nothing written:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

const write = (path, data) => writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
write(eventsPath, merged.events);
write(linksPath, merged.links);
write(insightsPath, merged.insights);

console.log(`✓ ${packId} updated: ${merged.events.length} events, ${merged.links.length} links, ${merged.insights.length} insights`);
console.log('  Review the diff, then commit. CI re-validates on push.');
