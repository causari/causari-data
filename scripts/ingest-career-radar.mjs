#!/usr/bin/env node
// Evidence-first Career Radar ingestion.
//
// Usage:
//   node scripts/ingest-career-radar.mjs <intake.json>
//   cat intake.json | node scripts/ingest-career-radar.mjs -
//   node scripts/ingest-career-radar.mjs <intake.json> --dry-run
//
// The script is intentionally deterministic and zero-dependency:
// - one canonical event source of truth (data/events.json)
// - pack references canonical ids (event-refs.json)
// - compatibility mirror is regenerated, never independently edited
// - explicit global promotion only
// - idempotent ingestId + payload hash
// - daily snapshots even on "no substantive update" heartbeats
// - validate everything in memory before writing anything

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePackData } from './validate-pack.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACK_ID = 'ai-career-radar-2026';
const PACK_DIR = join(ROOT, 'packs', PACK_ID);
const DRY_RUN = process.argv.includes('--dry-run');
const INPUT_ARG = process.argv.slice(2).find((arg) => arg !== '--dry-run');

const PATHS = {
  canonicalEvents: join(ROOT, 'data', 'events.json'),
  globalView: join(ROOT, 'data', 'views', 'global-canvas.json'),
  manifest: join(PACK_DIR, 'manifest.json'),
  eventRefs: join(PACK_DIR, 'event-refs.json'),
  eventsMirror: join(PACK_DIR, 'events.json'),
  links: join(PACK_DIR, 'links.json'),
  insights: join(PACK_DIR, 'insights.json'),
  views: join(PACK_DIR, 'views.json'),
  claims: join(PACK_DIR, 'claims.json'),
  evidence: join(PACK_DIR, 'evidence.json'),
  sources: join(PACK_DIR, 'sources.json'),
  forecasts: join(PACK_DIR, 'forecasts.json'),
  signals: join(PACK_DIR, 'signals.json'),
  snapshots: join(PACK_DIR, 'snapshots.json'),
  ingestLog: join(PACK_DIR, 'ingest-log.json'),
};

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DIRECTIONS = new Set(['up', 'down', 'mixed']);
const VISIBILITY = new Set(['pack-only', 'contextual', 'major']);

function fail(message) {
  console.error('✗ ' + message);
  process.exit(1);
}
function readJson(path, fallback) {
  if (!existsSync(path)) return structuredClone(fallback);
  return JSON.parse(readFileSync(path, 'utf8'));
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}
function stableStringify(value) {
  return JSON.stringify(stable(value));
}
function hashPayload(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}
function upsertById(list, incoming) {
  const result = list.map((item) => structuredClone(item));
  const index = new Map(result.map((item, i) => [item.id, i]));
  const created = [];
  const updated = [];
  for (const item of incoming) {
    const i = index.get(item.id);
    if (i === undefined) {
      index.set(item.id, result.length);
      result.push(structuredClone(item));
      created.push(item.id);
    } else if (stableStringify(result[i]) !== stableStringify(item)) {
      result[i] = structuredClone(item);
      updated.push(item.id);
    }
  }
  return { result, created, updated };
}
function uniqueAppend(list, values) {
  const out = [...list];
  const seen = new Set(out);
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}
function assertArray(value, name) {
  if (!Array.isArray(value)) fail(name + ' must be an array');
}
function assertKebab(value, name) {
  if (typeof value !== 'string' || !KEBAB.test(value)) fail(name + ' must be kebab-case');
}
function assertDate(value, name) {
  if (typeof value !== 'string' || !DATE.test(value)) fail(name + ' must be YYYY-MM-DD');
}
function readInput() {
  if (!INPUT_ARG) fail('input file required (or "-" for stdin)');
  const raw = INPUT_ARG === '-' ? readFileSync(0, 'utf8') : readFileSync(INPUT_ARG, 'utf8');
  try { return JSON.parse(raw); } catch (error) { fail('invalid intake JSON: ' + error.message); }
}
function validateIntake(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('intake must be an object');
  assertKebab(input.ingestId, 'ingestId');
  assertDate(input.checkedAt, 'checkedAt');

  if (!input.quality || typeof input.quality !== 'object') fail('quality object is required');
  if (typeof input.quality.substantive !== 'boolean') fail('quality.substantive must be boolean');
  if (input.quality.sourceReviewComplete !== true) fail('quality.sourceReviewComplete must be true');
  if (input.quality.observedVsForecastSeparated !== true) fail('quality.observedVsForecastSeparated must be true');
  if (input.quality.correlationCausalityReviewed !== true) fail('quality.correlationCausalityReviewed must be true');

  for (const field of ['sources', 'events', 'claims', 'evidence', 'signals']) {
    if (input[field] === undefined) input[field] = [];
    assertArray(input[field], field);
  }

  const payloadItems = input.sources.length + input.events.length + input.claims.length + input.evidence.length + input.signals.length;
  if (!input.quality.substantive && payloadItems > 0) {
    fail('non-substantive heartbeat must not contain new sources/events/claims/evidence/signals');
  }
  if (input.quality.substantive && payloadItems === 0) {
    fail('substantive intake must contain at least one data item');
  }

  for (const source of input.sources) assertKebab(source?.id, 'source.id');
  for (const event of input.events) {
    assertKebab(event?.id, 'event.id');
    if (event.promotion !== undefined) {
      if (!event.promotion || typeof event.promotion !== 'object') fail('event.promotion must be an object');
      const visibility = event.promotion.globalVisibility || 'pack-only';
      if (!VISIBILITY.has(visibility)) fail('invalid promotion.globalVisibility for ' + event.id);
      if (event.promotion.includeInGlobal === true && !String(event.promotion.reason || '').trim()) {
        fail('global promotion requires promotion.reason for ' + event.id);
      }
    }
  }
  for (const claim of input.claims) assertKebab(claim?.id, 'claim.id');
  for (const item of input.evidence) assertKebab(item?.id, 'evidence.id');
  for (const signal of input.signals) {
    assertKebab(signal?.id, 'signal.id');
    if (!DIRECTIONS.has(signal?.direction)) fail('invalid signal.direction for ' + signal.id);
    assertDate(signal?.observedAt, 'signal.observedAt');
  }
}
function normalizeCanonicalEvent(raw, sourceIds = []) {
  const event = structuredClone(raw);
  const promotion = event.promotion || {};
  delete event.promotion;
  delete event.sourceIds;

  event.scope = event.scope || 'world';
  event.globalVisibility = promotion.globalVisibility || event.globalVisibility || 'pack-only';
  event.canonicalOrigin = event.canonicalOrigin || PACK_ID;
  event.provenance = {
    ...(event.provenance || {}),
    pack: PACK_ID,
    sourceIds: sourceIds.length ? sourceIds : (event.provenance?.sourceIds || []),
  };
  return { event, promotion };
}
function activeSignalSnapshot(signals, checkedAt, intake, delta) {
  const counts = { up: 0, down: 0, mixed: 0 };
  const byDomain = {};
  for (const signal of signals) {
    if (DIRECTIONS.has(signal.direction)) counts[signal.direction] += 1;
    const domain = signal.domain || 'other';
    byDomain[domain] ||= { up: 0, down: 0, mixed: 0 };
    if (DIRECTIONS.has(signal.direction)) byDomain[domain][signal.direction] += 1;
  }
  return {
    date: checkedAt,
    substantive: inputBoolean(intake.quality.substantive),
    counts,
    totalSignals: signals.length,
    byDomain,
    newEventIds: delta.newEventIds,
    updatedEventIds: delta.updatedEventIds,
    newSignalIds: delta.newSignalIds,
    updatedSignalIds: delta.updatedSignalIds,
    ingestId: intake.ingestId,
  };
}
function inputBoolean(value) { return value === true; }

const input = readInput();
validateIntake(input);
const payloadHash = hashPayload(input);

const canonicalEvents = readJson(PATHS.canonicalEvents, []);
const globalView = readJson(PATHS.globalView, { eventIds: [], presentation: {}, promotedFromPacks: {} });
const manifest = readJson(PATHS.manifest, {});
const eventRefs = readJson(PATHS.eventRefs, []);
const links = readJson(PATHS.links, []);
const insights = readJson(PATHS.insights, []);
const views = readJson(PATHS.views, []);
const claims = readJson(PATHS.claims, []);
const evidence = readJson(PATHS.evidence, []);
const sources = readJson(PATHS.sources, []);
const forecasts = readJson(PATHS.forecasts, []);
const signals = readJson(PATHS.signals, []);
const snapshots = readJson(PATHS.snapshots, []);
const ingestLog = readJson(PATHS.ingestLog, []);

const previousLog = ingestLog.find((entry) => entry.ingestId === input.ingestId);
if (previousLog) {
  if (previousLog.payloadHash !== payloadHash) {
    fail('ingestId already exists with a different payload: ' + input.ingestId);
  }
  console.log('✓ Idempotent no-op: ingestId already applied (' + input.ingestId + ')');
  process.exit(0);
}

const sourceMerge = upsertById(sources, input.sources);
const sourceIds = new Set(sourceMerge.result.map((source) => source.id));

const normalizedEvents = input.events.map((raw) => {
  const declaredSourceIds = Array.isArray(raw.sourceIds) ? raw.sourceIds : [];
  for (const id of declaredSourceIds) {
    if (!sourceIds.has(id)) fail('event ' + raw.id + ' references missing sourceId ' + id);
  }
  return normalizeCanonicalEvent(raw, declaredSourceIds);
});
const eventMerge = upsertById(canonicalEvents, normalizedEvents.map((item) => item.event));
const canonicalIds = new Set(eventMerge.result.map((event) => event.id));

const claimReferencedEvents = input.claims.flatMap((claim) => Array.isArray(claim.eventIds) ? claim.eventIds : []);
for (const id of claimReferencedEvents) {
  if (!canonicalIds.has(id)) fail('claim references missing canonical event ' + id);
}

let nextEventRefs = uniqueAppend(eventRefs, [
  ...normalizedEvents.map((item) => item.event.id),
  ...claimReferencedEvents,
]);
for (const id of nextEventRefs) {
  if (!canonicalIds.has(id)) fail('pack eventRef missing canonical event ' + id);
}

const evidenceMerge = upsertById(evidence, input.evidence);
const claimMerge = upsertById(claims, input.claims);
const signalMerge = upsertById(signals, input.signals);

// Explicit promotion only. "contextual" alone does not silently place an event in /app.
globalView.eventIds ||= [];
globalView.presentation ||= {};
globalView.promotedFromPacks ||= {};
globalView.promotedFromPacks[PACK_ID] ||= [];
for (const item of normalizedEvents) {
  if (item.promotion?.includeInGlobal !== true) continue;
  const id = item.event.id;
  globalView.eventIds = uniqueAppend(globalView.eventIds, [id]);
  globalView.promotedFromPacks[PACK_ID] = uniqueAppend(globalView.promotedFromPacks[PACK_ID], [id]);
  if (item.promotion.presentation && typeof item.promotion.presentation === 'object') {
    globalView.presentation[id] = {
      ...(globalView.presentation[id] || {}),
      ...item.promotion.presentation,
    };
  }
}

// Compatibility mirror is always derived from canonical refs.
const canonicalById = new Map(eventMerge.result.map((event) => [event.id, event]));
const mirror = nextEventRefs.map((id) => canonicalById.get(id)).filter(Boolean);

const delta = {
  newEventIds: eventMerge.created,
  updatedEventIds: eventMerge.updated,
  newSignalIds: signalMerge.created,
  updatedSignalIds: signalMerge.updated,
};
const nextSnapshots = snapshots.filter((snapshot) => snapshot.date !== input.checkedAt);
nextSnapshots.push(activeSignalSnapshot(signalMerge.result, input.checkedAt, input, delta));
nextSnapshots.sort((a, b) => a.date.localeCompare(b.date));

manifest.monitoring ||= {};
manifest.asOf = input.checkedAt;
manifest.monitoring.lastCheckedAt = input.checkedAt;
manifest.monitoring.lastIngestId = input.ingestId;
if (input.quality.substantive) {
  manifest.monitoring.latestSubstantiveAt = input.checkedAt;
}
manifest.files ||= {};
manifest.files.snapshots = 'snapshots.json';
manifest.files.ingestLog = 'ingest-log.json';

const nextLog = [...ingestLog, {
  ingestId: input.ingestId,
  checkedAt: input.checkedAt,
  substantive: input.quality.substantive,
  payloadHash,
  summary: String(input.summary || ''),
  created: {
    sources: sourceMerge.created,
    events: eventMerge.created,
    evidence: evidenceMerge.created,
    claims: claimMerge.created,
    signals: signalMerge.created,
  },
  updated: {
    sources: sourceMerge.updated,
    events: eventMerge.updated,
    evidence: evidenceMerge.updated,
    claims: claimMerge.updated,
    signals: signalMerge.updated,
  },
  promotedToGlobal: normalizedEvents
    .filter((item) => item.promotion?.includeInGlobal === true)
    .map((item) => item.event.id),
}];

// Full pack validation happens before any write.
const validationErrors = validatePackData({
  events: mirror,
  links,
  insights,
  views,
  manifest,
  claims: claimMerge.result,
  evidence: evidenceMerge.result,
  sources: sourceMerge.result,
  forecasts,
  signals: signalMerge.result,
  snapshots: nextSnapshots,
  eventRefs: nextEventRefs,
  canonicalEvents: eventMerge.result,
}, PACK_ID);

const globalIds = new Set(eventMerge.result.map((event) => event.id));
for (const id of globalView.eventIds || []) {
  if (!globalIds.has(id)) validationErrors.push('[global-canvas] missing canonical event "' + id + '"');
}

if (validationErrors.length) {
  console.error('✗ Intake rejected; no files written:');
  for (const error of validationErrors) console.error('  - ' + error);
  process.exit(1);
}

const writes = [
  [PATHS.canonicalEvents, eventMerge.result],
  [PATHS.globalView, globalView],
  [PATHS.manifest, manifest],
  [PATHS.eventRefs, nextEventRefs],
  [PATHS.eventsMirror, mirror],
  [PATHS.sources, sourceMerge.result],
  [PATHS.evidence, evidenceMerge.result],
  [PATHS.claims, claimMerge.result],
  [PATHS.signals, signalMerge.result],
  [PATHS.snapshots, nextSnapshots],
  [PATHS.ingestLog, nextLog],
];

if (!DRY_RUN) {
  for (const [path, value] of writes) writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
}

console.log((DRY_RUN ? '✓ Dry-run valid' : '✓ Career Radar intake applied') + ': ' + input.ingestId);
console.log('  substantive: ' + input.quality.substantive);
console.log('  canonical events: +' + eventMerge.created.length + ' / ~' + eventMerge.updated.length);
console.log('  signals: +' + signalMerge.created.length + ' / ~' + signalMerge.updated.length);
console.log('  global promotions: ' + normalizedEvents.filter((item) => item.promotion?.includeInGlobal === true).length);
console.log('  snapshot: ' + input.checkedAt + ' (' + signalMerge.result.length + ' active signals)');
