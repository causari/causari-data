#!/usr/bin/env node
// Validate the canonical Causari graph projection contract.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const events = JSON.parse(readFileSync(join(ROOT, 'data', 'events.json'), 'utf8'));
const links = JSON.parse(readFileSync(join(ROOT, 'data', 'links.json'), 'utf8'));
const view = JSON.parse(readFileSync(join(ROOT, 'data', 'views', 'global-canvas.json'), 'utf8'));

const errors = [];
const eventIds = new Set();
for (const event of events) {
  if (!event?.id) errors.push('canonical event missing id');
  else if (eventIds.has(event.id)) errors.push('duplicate canonical event id: ' + event.id);
  else eventIds.add(event.id);
}

const linkIds = new Set();
for (const link of links) {
  if (!link?.id) errors.push('canonical link missing id');
  else if (linkIds.has(link.id)) errors.push('duplicate canonical link id: ' + link.id);
  else linkIds.add(link.id);
  if (!eventIds.has(link.fromEvent)) errors.push('canonical link ' + link.id + ' missing fromEvent ' + link.fromEvent);
  if (!eventIds.has(link.toEvent)) errors.push('canonical link ' + link.id + ' missing toEvent ' + link.toEvent);
}

if (!Array.isArray(view.eventIds)) errors.push('global view eventIds must be an array');
else {
  const seen = new Set();
  for (const id of view.eventIds) {
    if (seen.has(id)) errors.push('duplicate global view event id: ' + id);
    seen.add(id);
    if (!eventIds.has(id)) errors.push('global view references missing canonical event: ' + id);
    const event = events.find((candidate) => candidate.id === id);
    if (event?.globalVisibility === 'pack-only') {
      errors.push('global view includes pack-only event: ' + id);
    }
  }
}

for (const id of Object.keys(view.presentation || {})) {
  if (!view.eventIds?.includes(id)) errors.push('presentation hint references event not selected by global view: ' + id);
}

const contextIds = new Set();
for (const link of view.contextLinks || []) {
  if (!link?.id) errors.push('context link missing id');
  else if (contextIds.has(link.id)) errors.push('duplicate context link id: ' + link.id);
  else contextIds.add(link.id);
  if (link?.relationship !== 'context') errors.push('context link must use relationship=context: ' + (link?.id || '<missing id>'));
  if (!view.eventIds?.includes(link?.fromEvent)) errors.push('context link fromEvent not selected by global view: ' + (link?.fromEvent || '<missing>'));
  if (!view.eventIds?.includes(link?.toEvent)) errors.push('context link toEvent not selected by global view: ' + (link?.toEvent || '<missing>'));
  if (!String(link?.reason || '').trim()) errors.push('context link missing reason: ' + (link?.id || '<missing id>'));
}


const canonicalLinkIdSet = new Set(links.map((link) => link.id));
const suppressedIds = new Set();
for (const item of view.suppressedCausalLinks || []) {
  if (!item?.id) errors.push('suppressed causal link missing id');
  else if (suppressedIds.has(item.id)) errors.push('duplicate suppressed causal link id: ' + item.id);
  else suppressedIds.add(item.id);
  if (item?.id && !canonicalLinkIdSet.has(item.id)) errors.push('suppressed causal link not found in canonical links: ' + item.id);
  if (!String(item?.reason || '').trim()) errors.push('suppressed causal link missing reason: ' + (item?.id || '<missing>'));
}

for (const [pack, ids] of Object.entries(view.promotedFromPacks || {})) {
  if (!Array.isArray(ids)) {
    errors.push('promotedFromPacks.' + pack + ' must be an array');
    continue;
  }
  for (const id of ids) {
    if (!eventIds.has(id)) errors.push('promoted event missing canonical event: ' + pack + ' → ' + id);
    if (!view.eventIds?.includes(id)) errors.push('promoted event absent from global view: ' + pack + ' → ' + id);
  }
}


const allowedKnowledgeLayers = new Set(['world', 'evidence', 'forecast']);
for (const id of view.eventIds || []) {
  const event = events.find((candidate) => candidate.id === id);
  if (event?.knowledgeLayer && !allowedKnowledgeLayers.has(event.knowledgeLayer)) {
    errors.push('event ' + id + ' has invalid knowledgeLayer: ' + event.knowledgeLayer);
  }
}

const filterPolicy = view.filterPolicy;
if (!filterPolicy || typeof filterPolicy !== 'object') {
  errors.push('global view missing filterPolicy');
} else {
  const allowedLayers = new Set(['world', 'evidence', 'forecast']);
  const layerIds = new Set((filterPolicy.layers || []).map((item) => item?.id));
  for (const id of allowedLayers) if (!layerIds.has(id)) errors.push('filterPolicy missing layer: ' + id);

  for (const id of filterPolicy.default?.layers || []) {
    if (!allowedLayers.has(id)) errors.push('filterPolicy default layer invalid: ' + id);
  }
  for (const id of filterPolicy.default?.packs || []) {
    if (id !== 'core' && !(view.promotedFromPacks || {})[id]) {
      errors.push('filterPolicy default pack invalid: ' + id);
    }
  }
  for (const id of filterPolicy.packOrder || []) {
    if (id !== 'core' && !(view.promotedFromPacks || {})[id]) {
      errors.push('filterPolicy packOrder references unknown pack: ' + id);
    }
  }
}

if (errors.length) {
  console.error('✗ Global projection invalid:');
  for (const error of errors) console.error('  - ' + error);
  process.exit(1);
}

console.log('✓ Global projection valid');
console.log('  canonical events: ' + events.length);
console.log('  canonical links: ' + links.length);
console.log('  projected events: ' + view.eventIds.length);
