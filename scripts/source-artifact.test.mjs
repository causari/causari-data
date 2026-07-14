#!/usr/bin/env node

import { validateSourceCapture } from './source-artifact.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const legacy = validateSourceCapture({
  type: 'official',
  citation: 'FIFA match centre',
  url: 'https://example.com/match',
});
assert(legacy.length === 0, `legacy direct citation should remain valid: ${legacy.join('; ')}`);

const missingFlag = validateSourceCapture({
  capture: { mode: 'connector', capturedAt: '2026-07-15T08:00:00Z' },
});
assert(
  missingFlag.some((error) => error.includes('truncated')),
  'connector capture must declare truncation explicitly',
);

const missingArtifact = validateSourceCapture({
  capture: {
    mode: 'connector',
    truncated: true,
    capturedAt: '2026-07-15T08:00:00Z',
  },
});
assert(
  missingArtifact.some((error) => error.includes('artifact')),
  'truncated connector capture must retain a full artifact',
);

const completeConnector = validateSourceCapture({
  capture: {
    mode: 'connector',
    truncated: false,
    capturedAt: '2026-07-15T08:00:00Z',
  },
});
assert(completeConnector.length === 0, completeConnector.join('; '));

const retainedArtifact = validateSourceCapture({
  capture: {
    mode: 'connector',
    truncated: true,
    capturedAt: '2026-07-15T08:00:00Z',
    artifact: {
      uri: 'artifact://connector/fifa-match-centre-2026-07-15.json',
      sha256: 'a'.repeat(64),
      byteLength: 120345,
      preview: '{"matches":[...]}',
      retrievalHint: 'Read the stored JSON artifact before accepting any scoreline claim.',
    },
  },
});
assert(retainedArtifact.length === 0, retainedArtifact.join('; '));

console.log('✓ source artifact safety tests passed');
