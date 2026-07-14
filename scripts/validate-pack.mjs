#!/usr/bin/env node
// Zero-dependency validator for Causari data packs.
//
// Checks each pack under packs/<id>/ for schema conformance AND referential
// integrity (the part JSON Schema can't express): every link endpoint must be a
// real event, every insight instance must be a real link, ids must be unique and
// well-formed. Run before every commit that touches a pack — this is what keeps
// the daily live updates from shipping a broken graph to the public visual.
//
//   node scripts/validate-pack.mjs            # validate all packs
//   node scripts/validate-pack.mjs worldcup-2026
//
// Also exports validatePackData({events,links,insights}) for in-memory checks
// (used by add-match-day.mjs to validate BEFORE writing to disk).
//
// Exit 0 = clean, exit 1 = errors found.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateSourceCapture } from './source-artifact.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKS_DIR = join(ROOT, 'packs');

const DOMAINS = new Set([
  'technology', 'humanities', 'systems', 'science', 'economy',
  'geopolitics', 'philosophy', 'environment', 'culture', 'health',
]);
const RELATIONSHIPS = new Set(['caused', 'enabled', 'accelerated', 'inspired', 'delayed', 'prevented']);
const PRECISIONS = new Set(['millennium', 'century', 'decade', 'year', 'month', 'day']);
const STATUSES = new Set(['completed', 'scheduled', 'live', 'forecast']); // optional live-event field
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PATTERN_ID = /^pattern--[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isNum01(v) { return typeof v === 'number' && v >= 0 && v <= 1; }
function isNonEmptyStr(v) { return typeof v === 'string' && v.trim().length > 0; }

/**
 * Pure validation of a pack's in-memory data. Returns an array of error strings
 * (empty = valid). No I/O, no console — safe to call before writing to disk.
 */
export function validatePackData({ events, links, insights }, packId = 'pack') {
  const errors = [];
  const E = (msg) => errors.push(`[${packId}] ${msg}`);
  const eventIds = new Set();
  const linkIds = new Set();

  // --- Events ---
  if (!Array.isArray(events)) { E('events must be an array'); return errors; }
  for (const ev of events) {
    const id = ev?.id ?? '<missing id>';
    if (!isNonEmptyStr(ev.id)) E(`event has no id`);
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
    // optional live-event fields
    if (ev.status !== undefined && !STATUSES.has(ev.status)) E(`event ${id}: invalid status "${ev.status}"`);
    if (ev.entities !== undefined && !Array.isArray(ev.entities)) E(`event ${id}: entities must be an array`);
    if (ev.nextWatchpoints !== undefined && !Array.isArray(ev.nextWatchpoints)) E(`event ${id}: nextWatchpoints must be an array`);
    if (ev.forecastConfidence !== undefined && !isNum01(ev.forecastConfidence)) E(`event ${id}: forecastConfidence must be 0-1`);

    // Optional connector provenance. Legacy direct URL citations remain valid.
    if (ev.sources !== undefined) {
      if (!Array.isArray(ev.sources)) {
        E(`event ${id}: sources must be an array`);
      } else {
        ev.sources.forEach((source, index) => {
          const sourceErrors = validateSourceCapture(source, `event ${id}.sources[${index}]`);
          for (const sourceError of sourceErrors) E(sourceError);
        });
      }
    }
  }

  // --- Links (referential integrity is the point) ---
  if (!Array.isArray(links)) { E('links must be an array'); return errors; }
  for (const ln of links) {
    const id = ln?.id ?? '<missing id>';
    if (!isNonEmptyStr(ln.id)) E(`link has no id`);
    else if (linkIds.has(ln.id)) E(`duplicate link id: ${ln.id}`);
    else linkIds.add(ln.id);
    if (!RELATIONSHIPS.has(ln.relationship)) E(`link ${id}: invalid relationship "${ln.relationship}"`);
    if (!isNum01(ln.confidence)) E(`link ${id}: confidence must be 0-1`);
    if (!isNonEmptyStr(ln.evidence)) E(`link ${id}: missing evidence`);
    // endpoints MUST be real events
    if (!eventIds.has(ln.fromEvent)) E(`link ${id}: fromEvent "${ln.fromEvent}" is not an event in this pack`);
    if (!eventIds.has(ln.toEvent)) E(`link ${id}: toEvent "${ln.toEvent}" is not an event in this pack`);
    // id must encode {from}--{rel}-->{to}
    const expected = `${ln.fromEvent}--${ln.relationship}-->${ln.toEvent}`;
    if (ln.id !== expected) E(`link ${id}: id should be "${expected}"`);
  }

  // --- Insights (instances must be real links) ---
  if (!Array.isArray(insights)) { E('insights must be an array'); return errors; }
  const insightIds = new Set();
  for (const ins of insights) {
    const id = ins?.id ?? '<missing id>';
    if (!isNonEmptyStr(ins.id)) E(`insight has no id`);
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

/** Read a pack from disk and return { errors, counts }. */
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

// Run as CLI only when invoked directly (not when imported).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
