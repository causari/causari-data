#!/usr/bin/env node
// Ingest the REAL World Cup 2026 schedule + results from openfootball (public
// domain, no API key) and write the worldcup-2026 pack. Every match becomes an
// event with an openfootball source citation; a sparse causal layer is generated
// over notable (large-margin) results. Validates in memory; writes nothing on error.
//
//   node scripts/ingest-openfootball.mjs           # fetch live + write pack
//   node scripts/ingest-openfootball.mjs <file.json>   # use a local snapshot
//
// Run daily (see .github/workflows/ingest.yml) so the pack tracks the tournament.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePackData } from './validate-pack.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'packs', 'worldcup-2026');
const SRC = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';
const SOURCE = { type: 'open-data', citation: 'openfootball/worldcup.json (public domain)', url: 'https://github.com/openfootball/worldcup.json' };
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const slug = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const dateLabel = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; };

async function loadMatches() {
  const arg = process.argv[2];
  if (arg) return JSON.parse(readFileSync(arg, 'utf8')).matches;
  const res = await fetch(SRC);
  if (!res.ok) throw new Error(`fetch ${SRC} -> ${res.status}`);
  return (await res.json()).matches;
}

function buildEvents(matches) {
  const pairs = [];
  const seen = new Set();
  for (const m of matches) {
    const t1 = m.team1, t2 = m.team2, lane = m.group || m.round || 'Knockouts';
    let id = `wc2026-${slug(t1)}-${slug(t2)}-${m.date.slice(5).replace('-', '')}`;
    while (seen.has(id)) id += 'x';
    seen.add(id);
    const played = !!(m.score && m.score.ft);
    const dd = dateLabel(m.date);
    let title, description, whyItMatters, impactScore;
    if (played) {
      const [a, b] = m.score.ft;
      title = `${t1} ${a}–${b} ${t2}`;
      const verb = a > b ? 'beat' : (b > a ? 'lost to' : 'drew');
      description = `${t1} ${verb} ${t2} ${a}–${b} in ${lane}.`;
      const scorers = [...(m.goals1 || []), ...(m.goals2 || [])].map((g) => g.name).filter(Boolean);
      whyItMatters = scorers.length ? `Scorers: ${scorers.join(', ')}.` : `Full-time ${a}–${b}${m.ground ? ` at ${m.ground}` : ''}.`;
      impactScore = Math.min(0.78, 0.52 + Math.abs(a - b) * 0.05);
    } else {
      title = `${t1} vs ${t2}`;
      description = `${lane} fixture: ${t1} vs ${t2}, ${dd}${m.ground ? ` at ${m.ground}` : ''}.`;
      whyItMatters = `Upcoming ${lane} match.`;
      impactScore = 0.5;
    }
    const ev = {
      id, title, description, yearNum: 2026, yearLabel: '2026', precision: 'day',
      domains: ['culture', 'systems'], impactScore,
      tags: ['world-cup-2026', slug(lane), slug(t1), slug(t2)],
      date: m.date, dateLabel: dd, status: played ? 'completed' : 'scheduled',
      entities: [t1, t2, lane], whyItMatters, sources: [SOURCE],
    };
    pairs.push({ ev, m });
  }
  return pairs;
}

// Sparse causal layer: a large-margin win "accelerated" the winner's next fixture.
function buildLinks(pairs) {
  const byTeam = {};
  for (const p of pairs) for (const t of [p.m.team1, p.m.team2]) (byTeam[t] = byTeam[t] || []).push(p);
  for (const t in byTeam) byTeam[t].sort((a, b) => a.m.date.localeCompare(b.m.date));
  const links = []; const ids = new Set();
  for (const p of pairs) {
    if (!(p.m.score && p.m.score.ft)) continue;
    const [a, b] = p.m.score.ft; const margin = Math.abs(a - b);
    if (margin < 3) continue;
    const winner = a > b ? p.m.team1 : p.m.team2;
    const seq = byTeam[winner];
    const i = seq.indexOf(p);
    const next = seq[i + 1];
    if (!next) continue;
    const id = `${p.ev.id}--accelerated-->${next.ev.id}`;
    if (ids.has(id)) continue; ids.add(id);
    links.push({
      id, fromEvent: p.ev.id, toEvent: next.ev.id, relationship: 'accelerated', confidence: 0.62,
      evidence: `${winner}'s ${a}–${b} win was a statement result and a goal-difference cushion heading into the next fixture.`,
    });
  }
  return links;
}

function buildInsights(links) {
  if (!links.length) return [];
  return [{
    id: 'pattern--statement-win',
    pattern: 'Statement Win Creates Momentum and Goal-Difference Cushion',
    description: 'A large-margin win generates both a practical goal-difference advantage and narrative momentum that carries into the next fixture.',
    instances: links.map((l) => l.id),
    predictiveValue: 0.7, domains: ['culture', 'systems'],
  }];
}

const matches = await loadMatches();
const pairs = buildEvents(matches);
const events = pairs.map((p) => p.ev);
const links = buildLinks(pairs);
const insights = buildInsights(links);

const errors = validatePackData({ events, links, insights }, 'worldcup-2026');
if (errors.length) {
  console.error(`✗ ${errors.length} validation error(s) — nothing written:`);
  for (const e of errors.slice(0, 30)) console.error('  - ' + e);
  process.exit(1);
}
const write = (n, d) => writeFileSync(join(OUT, n), JSON.stringify(d, null, 2) + '\n');
write('events.json', events); write('links.json', links); write('insights.json', insights);
const played = events.filter((e) => e.status === 'completed').length;
console.log(`✓ worldcup-2026: ${events.length} events (${played} played, ${events.length - played} upcoming), ${links.length} links, ${insights.length} insights`);
