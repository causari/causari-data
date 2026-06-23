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
// Exit 0 = clean, exit 1 = errors found.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

function readJson(path, errors) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    errors.push(`${path}: invalid JSON — ${e.message}`);
    return null;
  }
}

function isNum01(v) { return typeof v === 'number' && v >= 0 && v <= 1; }
function isNonEmptyStr(v) { return typeof v === 'string' && v.trim().length > 0; }

function validatePack(packId, errors) {
  const dir = join(PACKS_DIR, packId);
  const events = readJson(join(dir, 'events.json'), errors);
  const links = readJson(join(dir, 'links.json'), errors);
  const insights = readJson(join(dir, 'insights.json'), errors);
  if (!events || !links || !insights) return;

  const E = (msg) => errors.push(`[${packId}] ${msg}`);
  const eventIds = new Set();
  const linkIds = new Set();

  // --- Events ---
  if (!Array.isArray(events)) return E('events.json must be an array');
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
  }

  // --- Links (referential integrity is the point) ---
  if (!Array.isArray(links)) return E('links.json must be an array');
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
  if (!Array.isArray(insights)) return E('insights.json must be an array');
  for (const ins of insights) {
    const id = ins?.id ?? '<missing id>';
    if (!isNonEmptyStr(ins.id)) E(`insight has no id`);
    else if (!ins.id.startsWith('pattern--')) E(`insight ${id}: id should follow "pattern--{kebab-name}"`);
    if (!isNonEmptyStr(ins.pattern)) E(`insight ${id}: missing pattern name`);
    if (!isNonEmptyStr(ins.description)) E(`insight ${id}: missing description`);
    if (!isNum01(ins.predictiveValue)) E(`insight ${id}: predictiveValue must be 0-1`);
    if (!Array.isArray(ins.domains) || ins.domains.length === 0) E(`insight ${id}: domains must be a non-empty array`);
    if (!Array.isArray(ins.instances)) { E(`insight ${id}: instances must be an array`); continue; }
    for (const ref of ins.instances) {
      if (!linkIds.has(ref)) E(`insight ${id}: instance "${ref}" is not a link in this pack`);
    }
  }

  const counts = `${eventIds.size} events, ${linkIds.size} links, ${insights.length} insights`;
  console.log(`  ✓ ${packId}: ${counts}`);
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
  for (const id of packIds) validatePack(id, errors);

  if (errors.length > 0) {
    console.error(`\n✗ ${errors.length} error(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log('\n✓ All packs valid.');
}

main();
