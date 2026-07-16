#!/usr/bin/env node
// Cross-surface consistency gate for the World Cup pack.
// `packs/worldcup-2026/events.json` is the structured fact surface while
// `wc2026/history/*.json` is the recap/editorial surface. They may be produced by
// different jobs and different sources, but they must never publish conflicting
// teams, scores or winners for the same physical match.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  asMatchNumber,
  eventTeamPair,
  normalizeTeamPair,
  parseResultTitle,
} from './worldcup-facts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EVENTS_PATH = join(ROOT, 'packs', 'worldcup-2026', 'events.json');
const HISTORY_DIR = join(ROOT, 'wc2026', 'history');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function scorePair(a, b) {
  const x = Number(a);
  const y = Number(b);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}

function winnerFromScores(home, away, score, penalties = null) {
  if (penalties && penalties[0] !== penalties[1]) return penalties[0] > penalties[1] ? home : away;
  if (!score || score[0] === score[1]) return null;
  return score[0] > score[1] ? home : away;
}

const events = readJson(EVENTS_PATH);
const live = events.filter((event) => event?.status);
const completed = live.filter((event) => event.status === 'completed');
const errors = [];
const warnings = [];
const E = (message) => errors.push(message);
const W = (message) => warnings.push(message);

const byMatchNumber = new Map();
const byDatePair = new Map();
for (const event of live) {
  const n = asMatchNumber(event.matchNumber);
  if (n != null) {
    if (byMatchNumber.has(n)) E(`duplicate matchNumber ${n}: ${byMatchNumber.get(n).id} and ${event.id}`);
    else byMatchNumber.set(n, event);
  }

  const pair = eventTeamPair(event);
  if (event.date && pair) {
    const key = `${event.date}|${pair}`;
    const previous = byDatePair.get(key);
    if (previous && previous.id !== event.id) E(`duplicate physical match ${key}: ${previous.id} and ${event.id}`);
    else byDatePair.set(key, event);
  }
}

if (!existsSync(HISTORY_DIR)) {
  W('wc2026/history does not exist; pack-only validation completed');
} else {
  const files = readdirSync(HISTORY_DIR).filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort();
  for (const file of files) {
    const doc = readJson(join(HISTORY_DIR, file));
    const date = doc.date || file.slice(0, 10);
    if (doc.status === 'final' && (!Array.isArray(doc.sources) || doc.sources.length === 0)) {
      E(`${file}: final recap requires at least one source`);
    }

    for (const recap of Array.isArray(doc.results) ? doc.results : []) {
      const home = String(recap.home ?? '').trim();
      const away = String(recap.away ?? '').trim();
      if (!home || !away) {
        E(`${file}: recap result is missing home/away`);
        continue;
      }

      const n = asMatchNumber(recap.matchNumber);
      const key = `${date}|${normalizeTeamPair(home, away)}`;
      const event = (n != null ? byMatchNumber.get(n) : null) || byDatePair.get(key);
      if (!event) {
        E(`${file}: no pack event found for ${home} vs ${away}${n != null ? ` (match ${n})` : ''}`);
        continue;
      }

      const parsed = parseResultTitle(event.title);
      if (!parsed) {
        E(`${file}: pack event ${event.id} has no parseable completed scoreline`);
        continue;
      }

      const recapScore = scorePair(recap.homeScore, recap.awayScore);
      if (!recapScore) {
        E(`${file}: ${home} vs ${away} has invalid homeScore/awayScore`);
        continue;
      }
      const recapPens = scorePair(recap.homePenalties, recap.awayPenalties);
      const sameOrientation = normalizeTeamPair(parsed.team1, parsed.team2) === normalizeTeamPair(home, away)
        && parsed.team1.toLowerCase() === home.toLowerCase();
      const eventScore = sameOrientation ? parsed.final : [parsed.final[1], parsed.final[0]];
      const eventPens = parsed.penalties
        ? (sameOrientation ? parsed.penalties : [parsed.penalties[1], parsed.penalties[0]])
        : null;

      if (eventScore[0] !== recapScore[0] || eventScore[1] !== recapScore[1]) {
        E(`${file}: score conflict for ${home} vs ${away}: recap ${recapScore[0]}–${recapScore[1]}, pack ${eventScore[0]}–${eventScore[1]} (${event.id})`);
      }
      if (recapPens && (!eventPens || eventPens[0] !== recapPens[0] || eventPens[1] !== recapPens[1])) {
        E(`${file}: penalty conflict for ${home} vs ${away}`);
      }

      const recapWinner = recap.winner || winnerFromScores(home, away, recapScore, recapPens);
      const eventWinner = winnerFromScores(home, away, eventScore, eventPens);
      if (recapWinner && eventWinner && recapWinner.toLowerCase() !== eventWinner.toLowerCase()) {
        E(`${file}: winner conflict for ${home} vs ${away}: recap ${recapWinner}, pack ${eventWinner}`);
      }

      if (n != null && asMatchNumber(event.matchNumber) !== n) {
        E(`${file}: matchNumber ${n} resolved to event ${event.id} with matchNumber ${event.matchNumber ?? '<missing>'}`);
      }
    }
  }
}

console.log(`worldcup consistency: ${completed.length} completed pack events, ${errors.length} error(s), ${warnings.length} warning(s)`);
for (const warning of warnings) console.log(`  ! ${warning}`);
if (errors.length) {
  for (const error of errors) console.error(`  x ${error}`);
  process.exit(1);
}
console.log('✓ pack facts and recap history are consistent');
