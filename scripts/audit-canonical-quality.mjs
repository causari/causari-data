#!/usr/bin/env node
// Canonical quality gate.
//
// This is intentionally a "no-new-debt" gate rather than an instant rewrite of
// hundreds of legacy demo edges. Existing debt is explicit in
// data/quality/canonical-baseline.json and may only move downward.
//
// Hard rules:
// - new forecasts cannot masquerade as legacy demo scenarios;
// - legacy demo forecasts must be explicitly labeled as such;
// - new forecast work needs non-demo provenance + confidence/reasoning;
// - raw demo-seed causal debt, high-confidence demo debt, and retro-causality
//   may not increase;
// - the global projection may not expose any retro-causal edge;
// - known weak global edges must stay suppressed until replaced/reviewed.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));

const events = read('data/events.json');
const links = read('data/links.json');
const view = read('data/views/global-canvas.json');
const baseline = read('data/quality/canonical-baseline.json');
const rejectedLinks = read('data/quality/rejected-links.json');

const errors = [];
const warnings = [];
const eventById = new Map(events.map((event) => [event.id, event]));
const selected = new Set(view.eventIds || []);
const suppressed = new Set((view.suppressedCausalLinks || []).map((item) => item.id));
const legacyForecastIds = new Set(baseline.legacyForecastIds || []);

const demoSeed = (item) => (item.sources || []).some((source) => source?.type === 'demo-seed');
const isRetro = (link) => {
  const from = eventById.get(link.fromEvent);
  const to = eventById.get(link.toEvent);
  if (!from || !to) return false;
  if (!Number.isFinite(from.yearNum) || !Number.isFinite(to.yearNum)) return false;
  return from.yearNum > to.yearNum;
};

const forecastEvents = events.filter((event) => event.knowledgeLayer === 'forecast');
for (const event of forecastEvents) {
  const quality = event.forecastQuality;
  if (!quality) {
    errors.push('forecast missing forecastQuality: ' + event.id);
    continue;
  }

  if (legacyForecastIds.has(event.id)) {
    if (quality.status !== 'legacy-demo') {
      errors.push('legacy forecast must remain status=legacy-demo until researched: ' + event.id);
    }
    if (quality.calibrated !== false) {
      errors.push('legacy demo forecast must not claim calibrated=true: ' + event.id);
    }
    if (!demoSeed(event)) {
      warnings.push('legacy forecast no longer uses demo-seed provenance; consider graduating it from baseline: ' + event.id);
    }
    continue;
  }

  if (quality.status === 'legacy-demo') {
    errors.push('new forecast cannot self-classify as legacy-demo: ' + event.id);
  }
  if (demoSeed(event)) {
    errors.push('new forecast cannot use demo-seed as provenance: ' + event.id);
  }
  if (typeof event.forecastConfidence !== 'number' || event.forecastConfidence < 0 || event.forecastConfidence > 1) {
    errors.push('new forecast requires forecastConfidence 0-1: ' + event.id);
  }
  if (!String(event.forecastReasoning || '').trim()) {
    errors.push('new forecast requires forecastReasoning: ' + event.id);
  }
  if (!(event.sources || []).length) {
    errors.push('new forecast requires at least one source: ' + event.id);
  }
}

const demoLinks = links.filter(demoSeed);
const highConfidenceDemoLinks = demoLinks.filter((link) => Number(link.confidence || 0) >= 0.8);
const retroLinks = links.filter(isRetro);

const ceilings = baseline.debtCeilings || {};
const debtChecks = [
  ['demoSeedCanonicalLinks', demoLinks.length],
  ['highConfidenceDemoSeedLinks', highConfidenceDemoLinks.length],
  ['retroCausalLinks', retroLinks.length],
];
for (const [key, value] of debtChecks) {
  const ceiling = Number(ceilings[key]);
  if (!Number.isFinite(ceiling)) errors.push('baseline missing debt ceiling: ' + key);
  else if (value > ceiling) errors.push(key + ' increased: ' + value + ' > baseline ' + ceiling);
}

const globalRetro = retroLinks.filter(
  (link) => selected.has(link.fromEvent) && selected.has(link.toEvent) && !suppressed.has(link.id),
);
if (globalRetro.length) {
  for (const link of globalRetro) errors.push('global projection exposes retro-causal edge: ' + link.id);
}

for (const id of baseline.requiredSuppressedGlobalLinkIds || []) {
  if (!suppressed.has(id)) errors.push('known weak global link is no longer suppressed: ' + id);
}

for (const item of view.suppressedCausalLinks || []) {
  if (!links.some((link) => link.id === item.id)) errors.push('suppressed global link does not exist: ' + item.id);
  if (!String(item.reason || '').trim()) errors.push('suppressed global link missing reason: ' + item.id);
}

const rejectedIds = new Set();
for (const item of rejectedLinks || []) {
  if (!item?.id) errors.push('rejected link missing id');
  else if (rejectedIds.has(item.id)) errors.push('duplicate rejected link id: ' + item.id);
  else rejectedIds.add(item.id);
  if (item?.id && links.some((link) => link.id === item.id)) {
    errors.push('rejected link still active in canonical links: ' + item.id);
  }
  if (!String(item?.reason || '').trim()) errors.push('rejected link missing reason: ' + (item?.id || '<missing>'));
  if (!String(item?.rejectionType || '').trim()) errors.push('rejected link missing rejectionType: ' + (item?.id || '<missing>'));
}

console.log('=== canonical-quality ===');
console.log('  events=' + events.length + ' forecasts=' + forecastEvents.length);
console.log('  links=' + links.length);
console.log('  demo-seed links=' + demoLinks.length + ' / baseline ' + ceilings.demoSeedCanonicalLinks);
console.log('  high-confidence demo-seed links=' + highConfidenceDemoLinks.length + ' / baseline ' + ceilings.highConfidenceDemoSeedLinks);
console.log('  retro-causal links=' + retroLinks.length + ' / baseline ' + ceilings.retroCausalLinks);
console.log('  suppressed global links=' + suppressed.size);
console.log('  unsuppressed global retro links=' + globalRetro.length);
console.log('  archived rejected links=' + rejectedLinks.length);

if (warnings.length) {
  console.log('\nWARN:');
  for (const warning of warnings) console.log('  ! ' + warning);
}

if (errors.length) {
  console.error('\nFAIL: ' + errors.length + ' canonical-quality error(s)');
  for (const error of errors) console.error('  x ' + error);
  process.exit(1);
}

console.log('\n✓ Canonical quality gate passed');
