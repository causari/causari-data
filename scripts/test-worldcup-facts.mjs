#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  assertNoIndependentFactConflict,
  formatResultDescription,
  formatResultTitle,
  matchKey,
  mergeSources,
  normalizeOutcome,
  parseResultTitle,
} from './worldcup-facts.mjs';

assert.equal(matchKey(99), 'wc2026-match-099');

const regular = normalizeOutcome({ ft: [2, 0] });
assert.deepEqual(regular.final, [2, 0]);
assert.equal(regular.decidedBy, 'regular_time');
assert.equal(formatResultTitle('Mexico', 'South Africa', regular), 'Mexico 2–0 South Africa');

const extraTime = normalizeOutcome({ ft: [1, 1], et: [1, 2] });
assert.deepEqual(extraTime.final, [1, 2]);
assert.equal(extraTime.decidedBy, 'extra_time');
assert.equal(formatResultTitle('Norway', 'England', extraTime), 'Norway 1–2 England');
assert.equal(formatResultDescription('Norway', 'England', 'Quarter-final', extraTime), 'England beat Norway 2–1 after extra time in Quarter-final.');

const penalties = normalizeOutcome({ ft: [0, 0], et: [0, 0], p: [4, 3] });
assert.equal(formatResultTitle('Switzerland', 'Colombia', penalties), 'Switzerland 0–0 (4–3 pens) Colombia');
assert.deepEqual(parseResultTitle('Switzerland 0–0 (4–3 pens) Colombia'), {
  team1: 'Switzerland',
  final: [0, 0],
  penalties: [4, 3],
  team2: 'Colombia',
});

assert.deepEqual(
  mergeSources(
    [{ sourceId: 'a', citation: 'A' }],
    [{ sourceId: 'a', citation: 'A newer label' }, { sourceId: 'b', citation: 'B' }],
  ).map((x) => x.sourceId),
  ['a', 'b'],
);

assert.doesNotThrow(() => assertNoIndependentFactConflict(
  {
    id: 'wc2026-norway-england-0711',
    matchNumber: 99,
    title: 'Norway 1–1 England',
    sources: [{ sourceId: 'openfootball:worldcup-2026' }],
  },
  {
    id: 'wc2026-norway-england-0711',
    matchNumber: 99,
    title: 'Norway 1–2 England',
    sources: [{ sourceId: 'openfootball:worldcup-2026' }],
  },
));

assert.throws(() => assertNoIndependentFactConflict(
  {
    id: 'wc2026-norway-england-0711',
    matchNumber: 99,
    title: 'Norway 1–1 England',
    sources: [{ sourceId: 'reuters:match-99', citation: 'Reuters' }],
  },
  {
    id: 'wc2026-norway-england-0711',
    matchNumber: 99,
    title: 'Norway 1–2 England',
    sources: [{ sourceId: 'openfootball:worldcup-2026' }],
  },
), /fact conflict/);

console.log('✓ worldcup-facts tests passed');
