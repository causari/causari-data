#!/usr/bin/env node
// Zero-dependency validator for Causari data packs.
// Checks schema shape, referential integrity and live-event identity invariants.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKS_DIR = join(ROOT, 'packs');

const DOMAINS = new Set([
  'technology', 'humanities', 'systems', 'science', 'economy',
  'geopolitics', 'philosophy', 'environment', 'culture', 'health',
]);
const RELATIONSHIPS = new Set(['caused', 'enabled', 'accelerated', 'inspired', 'delayed', 'prevented']);
const PRECISIONS = new Set(['millennium', 'century', 'decade', 'year', 'month', 'day']);
const STATUSES = new Set(['completed', 'scheduled', 'live', 'forecast']);
const DECIDED_BY = new Set(['regular_time', 'extra_time', 'penalties']);
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PATTERN_ID = /^pattern--[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isNum01(v) { return typeof v === 'number' && v >= 0 && v <= 1; }
function isNonEmptyStr(v) { return typeof v === 'string' && v.trim().length > 0; }
function isScorePair(v) {
  return Array.isArray(v)
    && v.length === 2
    && v.every((n) => Number.isInteger(n) && n >= 0);
}

export function validatePackData({ events, links, insights }, packId = 'pack') {
  const errors = [];
  const E = (msg) => errors.push(`[${packId}] ${msg}`);
  const eventIds = new Set();
  const linkIds = new Set();
  const matchNumbers = new Map();

  // --- Events ---
  if (!Array.isArray(events)) { E('events must be an array'); return errors; }
  for (const ev of events) {
    const id = ev?.id ?? '<missing id>';
    if (!isNonEmptyStr(ev.id)) E('event has no id');
    else if (!KEBAB.test(ev.id)) E(`event id not kebab-case: ${ev.id}`);
    else if (eventIds.has(ev.id)) E(`duplicate event id: ${ev.id}`);
    else eventIds.add(ev.id);

    if (!isNonEmptyStr(ev.title)) E(`event ${id}: missing title`);
    if (!isNonEmptyStr(ev.description)) E(`event ${id}: missing description`);
    if (typeof ev.yearNum !== 'number') E(`event ${id}: yearNum must be a number`);
    if (!isNonEmptyStr(ev.yearLabel)) E(`event ${id}: missing yearLabel`);
    if (!PRECISIONS.has(ev.precision)) E(`event ${id}: invalid precision "${ev.precision}"`);
    if (!Array.isArray(ev.domains) || ev.domains.length === 0) E(`event ${id}: domains must be a non-empty array`);
    else for (const d of ev.domains) if (!DOMAINS.has(d)) E(`event ${id}: invalid domain "${d}"`);
    if (!isNum01(ev.impactScore)) E(`event ${id}: impactScore must be 0-1`);
    if (!Array.isArray(ev.tags)) E(`event ${id}: tags must be an array`);

    if (ev.status !== undefined && !STATUSES.has(ev.status)) E(`event ${id}: invalid status "${ev.status}"`);
    if (ev.entities !== undefined && !Array.isArray(ev.entities)) E(`event ${id}: entities must be an array`);
    if (ev.nextWatchpoints !== undefined && !Array.isArray(ev.nextWatchpoints)) E(`event ${id}: nextWatchpoints must be an array`);
    if (ev.forecastConfidence !== undefined && !isNum01(ev.forecastConfidence)) E(`event ${id}: forecastConfidence must be 0-1`);

    // Stable live-event identity. A human-readable id may change when W91 resolves
    // to Norway, but matchNumber must stay unique across the pack.
    if (ev.matchNumber !== undefined) {
      if (!Number.isInteger(ev.matchNumber) || ev.matchNumber <= 0) {
        E(`event ${id}: matchNumber must be a positive integer`);
      } else if (matchNumbers.has(ev.matchNumber)) {
        E(`duplicate matchNumber ${ev.matchNumber}: ${matchNumbers.get(ev.matchNumber)} and ${id}`);
      } else {
        matchNumbers.set(ev.matchNumber, id);
      }
      if (ev.matchKey !== undefined) {
        const expected = `wc2026-match-${String(ev.matchNumber).padStart(3, '0')}`;
        if (ev.matchKey !== expected) E(`event ${id}: matchKey should be "${expected}"`);
      }
    }
    if (ev.sourceMatchId !== undefined && !isNonEmptyStr(ev.sourceMatchId)) {
      E(`event ${id}: sourceMatchId must be a non-empty string`);
    }

    if (ev.status === 'completed' && (!Array.isArray(ev.sources) || ev.sources.length === 0)) {
      E(`event ${id}: completed event requires at least one source citation`);
    }

    if (ev.result !== undefined) {
      if (!ev.result || typeof ev.result !== 'object') {
        E(`event ${id}: result must be an object`);
      } else {
        if (!isScorePair(ev.result.final)) E(`event ${id}: result.final must be [home, away] non-negative integers`);
        if (!isScorePair(ev.result.regulation)) E(`event ${id}: result.regulation must be [home, away] non-negative integers`);
        if (ev.result.extraTime !== undefined && !isScorePair(ev.result.extraTime)) E(`event ${id}: result.extraTime must be a score pair`);
        if (ev.result.penalties !== undefined && !isScorePair(ev.result.penalties)) E(`event ${id}: result.penalties must be a score pair`);
        if (!DECIDED_BY.has(ev.result.decidedBy)) E(`event ${id}: invalid result.decidedBy "${ev.result.decidedBy}"`);
        if (ev.result.decidedBy === 'extra_time' && !isScorePair(ev.result.extraTime)) E(`event ${id}: extra_time result requires result.extraTime`);
        if (ev.result.decidedBy === 'penalties' && !isScorePair(ev.result.penalties)) E(`event ${id}: penalties result requires result.penalties`);
      }
      if (ev.status !== 'completed') E(`event ${id}: structured result requires status="completed"`);
    }
  }

  // --- Links ---
  if (!Array.isArray(links)) { E('links must be an array'); return errors; }
  for (const ln of links) {
    const id = ln?.id ?? '<missing id>';
    if (!isNonEmptyStr(ln.id)) E('link has no id');
    else if (linkIds.has(ln.id)) E(`duplicate link id: ${ln.id}`);
    else linkIds.add(ln.id);
    if (!RELATIONSHIPS.has(ln.relationship)) E(`link ${id}: invalid relationship "${ln.relationship}"`);
    if (!isNum01(ln.confidence)) E(`link ${id}: confidence must be 0-1`);
    if (!isNonEmptyStr(ln.evidence)) E(`link ${id}: missing evidence`);
    if (!eventIds.has(ln.fromEvent)) E(`link ${id}: fromEvent "${ln.fromEvent}" is not an event in this pack`);
    if (!eventIds.has(ln.toEvent)) E(`link ${id}: toEvent "${ln.toEvent}" is not an event in this pack`);
    const expected = `${ln.fromEvent}--${ln.relationship}-->${ln.toEvent}`;
    if (ln.id !== expected) E(`link ${id}: id should be "${expected}"`);
  }

  // --- Insights ---
  if (!Array.isArray(insights)) { E('insights must be an array'); return errors; }
  const insightIds = new Set();
  for (const ins of insights) {
    const id = ins?.id ?? '<missing id>';
    if (!isNonEmptyStr(ins.id)) E('insight has no id');
    else if (!PATTERN_ID.test(ins.id)) E(`insight ${id}: id should follow "pattern--{kebab-name}"`);
    else if (insightIds.has(ins.id)) E(`duplicate insight id: ${ins.id}`);
    else insightIds.add(ins.id);
    if (!isNonEmptyStr(ins.pattern)) E(`insight ${id}: missing pattern name`);
    if (!isNonEmptyStr(ins.description)) E(`insight ${id}: missing description`);
    if (!isNum01(ins.predictiveValue)) E(`insight ${id}: predictiveValue must be 0-1`);
    if (!Array.isArray(ins.domains) || ins.domains.length === 0) E(`insight ${id}: domains must be a non-empty array`);
    else for (const d of ins.domains) if (!DOMAINS.has(d)) E(`insight ${id}: invalid domain "${d}"`);
    if (!Array.isArray(ins.instances)) { E(`insight ${id}: instances must be an array`); continue; }
    for (const ref of ins.instances) {
      if (!linkIds.has(ref)) E(`insight ${id}: instance "${ref}" is not a link in this pack`);
    }
  }

  return errors;
}

export function validatePackFromDisk(packId) {
  const dir = join(PACKS_DIR, packId);
  const read = (name) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
  let data;
  try {
    data = { events: read('events.json'), links: read('links.json'), insights: read('insights.json') };
  } catch (e) {
    return { errors: [`[${packId}] cannot read pack — ${e.message}`], counts: '' };
  }
  const errors = validatePackData(data, packId);
  const counts = `${data.events.length} events, ${data.links.length} links, ${data.insights.length} insights`;
  return { errors, counts };
}

function main() {
  const arg = process.argv[2];
  if (!existsSync(PACKS_DIR)) { console.error('No packs/ directory found.'); process.exit(1); }
  const packIds = arg
    ? [arg]
    : readdirSync(PACKS_DIR).filter((d) => statSync(join(PACKS_DIR, d)).isDirectory());
  if (packIds.length === 0) { console.log('No packs to validate.'); return; }

  const errors = [];
  console.log(`Validating ${packIds.length} pack(s):`);
  for (const id of packIds) {
    const { errors: errs, counts } = validatePackFromDisk(id);
    if (errs.length === 0) console.log(`  ✓ ${id}: ${counts}`);
    errors.push(...errs);
  }

  if (errors.length > 0) {
    console.error(`\n✗ ${errors.length} error(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log('\n✓ All packs valid.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
