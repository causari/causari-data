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

if (errors.length) {
  console.error('✗ Global projection invalid:');
  for (const error of errors) console.error('  - ' + error);
  process.exit(1);
}

console.log('✓ Global projection valid');
console.log('  canonical events: ' + events.length);
console.log('  canonical links: ' + links.length);
console.log('  projected events: ' + view.eventIds.length);
