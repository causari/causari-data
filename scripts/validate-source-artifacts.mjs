#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateSourceCapture } from './source-artifact.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKS_DIR = join(ROOT, 'packs');

export function validateEventSources(events, packId = 'pack') {
  const errors = [];
  if (!Array.isArray(events)) return [`[${packId}] events must be an array`];

  for (const event of events) {
    const eventId = event?.id || '<missing id>';
    if (event?.sources === undefined) continue;
    if (!Array.isArray(event.sources)) {
      errors.push(`[${packId}] event ${eventId}: sources must be an array`);
      continue;
    }

    event.sources.forEach((source, index) => {
      const sourceErrors = validateSourceCapture(
        source,
        `event ${eventId}.sources[${index}]`,
      );
      for (const error of sourceErrors) errors.push(`[${packId}] ${error}`);
    });
  }

  return errors;
}

export function validatePackSourceArtifacts(packId) {
  const eventsPath = join(PACKS_DIR, packId, 'events.json');
  try {
    const events = JSON.parse(readFileSync(eventsPath, 'utf8'));
    return validateEventSources(events, packId);
  } catch (error) {
    return [`[${packId}] cannot read events.json — ${error.message}`];
  }
}

function main() {
  const requestedPack = process.argv[2];
  if (!existsSync(PACKS_DIR)) {
    console.error('No packs/ directory found.');
    process.exit(1);
  }

  const packIds = requestedPack
    ? [requestedPack]
    : readdirSync(PACKS_DIR).filter((entry) => statSync(join(PACKS_DIR, entry)).isDirectory());

  const errors = [];
  console.log(`Validating source artifacts for ${packIds.length} pack(s):`);
  for (const packId of packIds) {
    const packErrors = validatePackSourceArtifacts(packId);
    if (packErrors.length === 0) console.log(`  ✓ ${packId}`);
    errors.push(...packErrors);
  }

  if (errors.length > 0) {
    console.error(`\n✗ ${errors.length} source artifact error(s):`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  console.log('\n✓ All source artifact captures are explicit and retrievable.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
