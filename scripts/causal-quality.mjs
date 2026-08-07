#!/usr/bin/env node
// Profile-aware semantic quality gate for Causari packs.
// Structural integrity belongs to validate-pack.mjs; this file catches
// mechanical causal text, duplicated evidence, dishonest confidence, and
// domain-specific regressions such as malformed World Cup scorelines.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKS_DIR = join(ROOT, 'packs');

const KNOWN_TEAMS = new Set([
  'Algeria', 'Argentina', 'Australia', 'Austria', 'Belgium', 'Bosnia & Herzegovina',
  'Brazil', 'Canada', 'Cape Verde', 'Colombia', 'Croatia', 'Curaçao', 'Czech Republic',
  'DR Congo', 'Ecuador', 'Egypt', 'England', 'France', 'Germany', 'Ghana', 'Haiti',
  'Iran', 'Iraq', 'Ivory Coast', 'Japan', 'Jordan', 'Mexico', 'Morocco', 'Netherlands',
  'New Zealand', 'Norway', 'Panama', 'Paraguay', 'Portugal', 'Qatar', 'Saudi Arabia',
  'Scotland', 'Senegal', 'South Africa', 'South Korea', 'Spain', 'Sweden', 'Switzerland',
  'Tunisia', 'Turkey', 'USA', 'Uruguay', 'Uzbekistan',
]);
const TEAM_ALIASES = {
  'korea republic': 'South Korea', 'republic of korea': 'South Korea',
  "côte d'ivoire": 'Ivory Coast', 'cote d’ivoire': 'Ivory Coast', "cote d'ivoire": 'Ivory Coast',
  'ir iran': 'Iran', 'islamic republic of iran': 'Iran',
  'united states': 'USA', 'united states of america': 'USA',
  'türkiye': 'Turkey', 'turkiye': 'Turkey', 'czechia': 'Czech Republic',
  'bosnia and herzegovina': 'Bosnia & Herzegovina',
  'democratic republic of the congo': 'DR Congo', 'congo dr': 'DR Congo', 'cabo verde': 'Cape Verde',
};
const KNOWN_ROUNDS = new Set([
  'round of 32', 'r32', '1/16', 'last 32',
  'round of 16', 'r16', 'last 16', '1/8',
  'quarter-final', 'quarterfinal', 'quarter final', 'quarter-finals', 'quarterfinals', 'qf', '1/4',
  'semi-final', 'semifinal', 'semi final', 'semi-finals', 'semifinals', 'sf',
  'match for third place', 'third place', 'third-place play-off', '3rd place', 'bronze final',
  'final',
]);
const GROUP_RE = /^group [a-l]$/i;
const TITLE_RE = /^(.*?)\s+(\d{1,2})\s*[–-]\s*(\d{1,2})(?:\s*\(\s*(\d{1,2})\s*[–-]\s*(\d{1,2})\s*pens?\.?\s*\))?\s+(.*)$/;
const ANY_SCORE_RE = /\b(\d{1,2})\s*[–-]\s*(\d{1,2})\b/;
const TEMPLATED_WHY = [/^scorers:/i, /^full-time\s+\d/i, /^upcoming\s+.*match/i];

function canonTeam(n) {
  const s = String(n ?? '').trim();
  if (KNOWN_TEAMS.has(s)) return s;
  return TEAM_ALIASES[s.toLowerCase()] || null;
}
function parseTitle(title) {
  const m = String(title ?? '').match(TITLE_RE);
  if (!m) return null;
  return { a: m[1].trim(), sa: +m[2], sb: +m[3], penA: m[4] == null ? null : +m[4], penB: m[5] == null ? null : +m[5], b: m[6].trim() };
}
function winnerOf(p) {
  if (p.sa !== p.sb) return p.sa > p.sb ? p.a : p.b;
  if (p.penA != null && p.penA !== p.penB) return p.penA > p.penB ? p.a : p.b;
  return null;
}
function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function countBy(arr) { const out = {}; for (const x of arr) out[x] = (out[x] || 0) + 1; return out; }
function normalizeEvidence(s) { return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' '); }
function defaultProfile(packId) { return packId === 'worldcup-2026' ? 'sports-live' : 'generic'; }

function baselineKeys(baseline) {
  return new Set((baseline?.allowedIssues || []).map((x) => `${x.code}:${x.key}`));
}

/**
 * Returns { errors, warnings, stats }. A baseline may temporarily downgrade an
 * exact known issue to a warning, preserving a no-new-debt ratchet.
 */
export function assessCausalQuality({ events, links, insights }, packId = 'pack', options = {}) {
  const profile = options.profile || defaultProfile(packId);
  const allowed = baselineKeys(options.baseline);
  const errors = [];
  const warnings = [];
  const E = (code, key, message) => {
    const full = `[${packId}] ${message}`;
    if (allowed.has(`${code}:${key}`)) warnings.push(`${full} (quality baseline)`);
    else errors.push(full);
  };
  const W = (message) => warnings.push(`[${packId}] ${message}`);

  const evList = Array.isArray(events) ? events : [];
  const lkList = Array.isArray(links) ? links : [];
  const sports = profile === 'sports-live';
  const live = sports ? evList.filter((e) => e && e.status) : evList.filter((e) => e && e.whyItMatters);
  const completed = sports ? live.filter((e) => e.status === 'completed') : [];
  const scheduled = sports ? live.filter((e) => e.status === 'scheduled' || e.status === 'live') : [];

  // 1. Narrative text must be causal, not an ingest template.
  let templatedWhy = 0;
  for (const e of live) {
    const why = String(e.whyItMatters ?? '');
    if (TEMPLATED_WHY.some((re) => re.test(why))) {
      templatedWhy++;
      E('templated-why', e.id, `event ${e.id}: whyItMatters is templated ("${why.slice(0, 40)}…") — write real stakes / what it changes / what it sets up`);
    } else if (why.trim() && why.trim().length < 40) {
      W(`event ${e.id}: whyItMatters is very short (${why.trim().length} chars) — likely thin`);
    }
  }

  // 2-4. Sports-only checks. Other domains must not be forced through a scoreline model.
  const reportedBackwards = new Set();
  if (sports) {
    for (const e of completed) {
      const parsed = parseTitle(e.title);
      if (!parsed) {
        E('invalid-score-title', e.id, `event ${e.id}: completed match title "${e.title}" has no parseable "A n–m B" scoreline`);
        continue;
      }
      const winner = winnerOf(parsed);
      if (winner) {
        const touching = lkList.filter((l) => l.fromEvent === e.id || l.toEvent === e.id);
        for (const l of touching) {
          if (reportedBackwards.has(l.id)) continue;
          const claim = new RegExp(`${escapeRe(winner)}['’]?s\\s+(\\d{1,2})\\s*[–-]\\s*(\\d{1,2})\\s+win`, 'i');
          const match = String(l.evidence ?? '').match(claim);
          if (match && +match[1] < +match[2]) {
            reportedBackwards.add(l.id);
            E('backwards-score', l.id, `link ${l.id}: evidence reverses the winner's scoreline`);
          }
        }
      }
    }

    for (const e of scheduled) {
      if (ANY_SCORE_RE.test(String(e.title ?? '')) && parseTitle(e.title)) {
        E('scheduled-score', e.id, `event ${e.id}: status="${e.status}" but title "${e.title}" carries a result`);
      }
    }

    for (const e of live) {
      const entities = Array.isArray(e.entities) ? e.entities : [];
      const roundEntities = entities.filter((x) => KNOWN_ROUNDS.has(String(x).trim().toLowerCase()));
      const isKnockout = roundEntities.length > 0 || /\b(round of 32|round of 16|quarter|semi|final|third place)\b/i.test(String(e.title ?? ''));
      for (const x of entities) {
        const s = String(x).trim();
        if (GROUP_RE.test(s) || KNOWN_ROUNDS.has(s.toLowerCase()) || canonTeam(s)) continue;
        if (/\b(final|round|quarter|semi|last \d|1\/\d)\b/i.test(s)) {
          E('unknown-round', `${e.id}:${s}`, `event ${e.id}: entity "${s}" is not a recognized round label`);
        }
      }
      if (isKnockout) {
        const looksLikeTeam = (x) => /^[A-Z][a-zé&' -]{1,28}$/.test(String(x).trim())
          && !/stadium|arena|park|field|metlife|azteca|bay area|new jersey|city|angeles|francisco/i.test(x);
        for (const x of entities) {
          if (GROUP_RE.test(String(x)) || KNOWN_ROUNDS.has(String(x).trim().toLowerCase()) || canonTeam(x)) continue;
          if (looksLikeTeam(x)) E('unknown-team', `${e.id}:${x}`, `event ${e.id}: knockout entity "${x}" does not resolve to a known team or alias`);
        }
      }
    }
  }

  // 5. Relationship diversity is profile-sensitive. Systemic policy graphs may
  // legitimately use mostly "enabled"; sports narrative graphs should vary.
  const relCounts = countBy(lkList.map((l) => l.relationship));
  const distinctRels = Object.keys(relCounts).length;
  if (sports && lkList.length >= 8) {
    const [topRel, topN] = Object.entries(relCounts).sort((a, b) => b[1] - a[1])[0] || ['', 0];
    const share = topN / lkList.length;
    if (share > 0.7) E('relationship-dominance', topRel, `links: "${topRel}" is ${Math.round(share * 100)}% of ${lkList.length} links (>70%)`);
    if (distinctRels < 3) E('relationship-variety', 'all', `links: only ${distinctRels} relationship type(s) across ${lkList.length} links — need ≥3 for sports-live`);
  } else if (!sports && lkList.length >= 8 && distinctRels < 2) {
    W(`links: only ${distinctRels} relationship type across ${lkList.length} links — review whether the graph is over-normalized`);
  }

  // 6-7. Generic causal-substrate checks.
  const confidences = lkList.map((l) => l.confidence).filter((c) => typeof c === 'number');
  const distinctConf = new Set(confidences.map((c) => c.toFixed(2))).size;
  if (confidences.length >= 8 && distinctConf <= 1) E('confidence-uniform', 'all', `links: every link has confidence ${confidences[0]} — calibrate claims honestly`);

  const evidenceCounts = countBy(lkList.map((l) => normalizeEvidence(l.evidence)));
  for (const [evidence, count] of Object.entries(evidenceCounts)) {
    if (evidence && count > 1) E('duplicate-evidence', evidence, `links: the same evidence sentence is reused ${count}× ("${evidence.slice(0, 50)}…")`);
  }

  // 8. Watchpoints are sports-specific; translation coverage is generic.
  const withWatch = completed.filter((e) => Array.isArray(e.nextWatchpoints) && e.nextWatchpoints.length > 0);
  const watchCoverage = completed.length ? withWatch.length / completed.length : 1;
  if (sports && completed.length >= 4 && watchCoverage < 0.5) {
    E('watchpoint-coverage', 'all', `nextWatchpoints: only ${withWatch.length}/${completed.length} completed matches (${Math.round(watchCoverage * 100)}%) carry watchpoints`);
  } else if (sports && completed.length >= 4 && watchCoverage < 0.9) {
    W(`nextWatchpoints: ${withWatch.length}/${completed.length} completed matches (${Math.round(watchCoverage * 100)}%) carry watchpoints — target ≥90%`);
  }

  const sameText = (a, b) => normalizeEvidence(a) === normalizeEvidence(b) && String(a ?? '').trim() !== '';
  const withWhy = live.filter((e) => String(e.whyItMatters ?? '').trim() && !TEMPLATED_WHY.some((re) => re.test(String(e.whyItMatters))));
  let whyViCount = 0;
  for (const e of withWhy) {
    const vi = String(e.whyItMatters_vi ?? '').trim();
    if (!vi) { W(`event ${e.id}: has whyItMatters but no whyItMatters_vi`); continue; }
    whyViCount++;
    if (sameText(vi, e.whyItMatters)) W(`event ${e.id}: whyItMatters_vi is identical to English`);
  }
  const withWatchAll = sports ? live.filter((e) => Array.isArray(e.nextWatchpoints) && e.nextWatchpoints.length > 0) : [];
  let watchViCount = 0;
  for (const e of withWatchAll) {
    const vi = e.nextWatchpoints_vi;
    if (!Array.isArray(vi) || vi.length === 0) { W(`event ${e.id}: has nextWatchpoints but no nextWatchpoints_vi`); continue; }
    if (vi.length !== e.nextWatchpoints.length) W(`event ${e.id}: nextWatchpoints_vi count does not match English`);
    watchViCount++;
  }

  const lineage = sports ? evList.filter((e) => !e.status && !e.date) : [];
  if (sports && lineage.length === 0) W('lineage: 0 history-spine events');
  if ((insights?.length ?? 0) < 2) W(`insights: only ${insights?.length ?? 0} pattern(s) — the pattern lens is thin`);

  const whyViCoverage = withWhy.length ? whyViCount / withWhy.length : 1;
  const watchViCoverage = withWatchAll.length ? watchViCount / withWatchAll.length : 1;
  return {
    errors,
    warnings,
    stats: {
      profile, events: evList.length, live: live.length, completed: completed.length,
      scheduled: scheduled.length, links: lkList.length, insights: insights?.length ?? 0,
      lineage: lineage.length, distinctRels, relCounts, distinctConf, templatedWhy,
      watchCoverage: Math.round(watchCoverage * 100),
      whyViCoverage: Math.round(whyViCoverage * 100), watchViCoverage: Math.round(watchViCoverage * 100),
      whyViCount, whyTotal: withWhy.length, watchViCount, watchTotal: withWatchAll.length,
    },
  };
}

function readPackFromDisk(packId) {
  const dir = join(PACKS_DIR, packId);
  const read = (name) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
  const readOptional = (name) => existsSync(join(dir, name)) ? read(name) : undefined;
  return {
    pack: { events: read('events.json'), links: read('links.json'), insights: read('insights.json') },
    manifest: readOptional('manifest.json'),
    baseline: readOptional('quality-baseline.json'),
  };
}

function main() {
  const args = process.argv.slice(2);
  const fromIdx = args.indexOf('--from');
  const fromDir = fromIdx !== -1 ? args[fromIdx + 1] : null;
  const packId = args.find((a) => !a.startsWith('--') && a !== fromDir);

  let targets;
  if (fromDir) {
    const read = (name) => JSON.parse(readFileSync(join(fromDir, name), 'utf8'));
    const readOptional = (name) => existsSync(join(fromDir, name)) ? read(name) : undefined;
    targets = [[packId || fromDir, {
      pack: { events: read('events.json'), links: read('links.json'), insights: read('insights.json') },
      manifest: readOptional('manifest.json'), baseline: readOptional('quality-baseline.json'),
    }]];
  } else if (packId) {
    targets = [[packId, readPackFromDisk(packId)]];
  } else {
    if (!existsSync(PACKS_DIR)) { console.error('No packs/ directory.'); process.exit(1); }
    targets = readdirSync(PACKS_DIR)
      .filter((d) => statSync(join(PACKS_DIR, d)).isDirectory())
      .map((id) => [id, readPackFromDisk(id)])
      .filter(([id, data]) => data.manifest?.quality?.causalProfile || id === 'worldcup-2026');
  }

  let failed = false;
  for (const [id, data] of targets) {
    const profile = data.manifest?.quality?.causalProfile || defaultProfile(id);
    const { errors, warnings, stats } = assessCausalQuality(data.pack, id, { profile, baseline: data.baseline });
    console.log(`\n=== causal-quality: ${id} [${profile}] ===`);
    console.log(`  events=${stats.events} (completed ${stats.completed}, scheduled ${stats.scheduled}) links=${stats.links} insights=${stats.insights} lineage=${stats.lineage}`);
    console.log(`  relationships=${stats.distinctRels} distinct ${JSON.stringify(stats.relCounts)} · confidence=${stats.distinctConf} distinct`);
    console.log(`  templated whyItMatters=${stats.templatedWhy} · watchpoint coverage=${stats.watchCoverage}%`);
    console.log(`  VI coverage: whyItMatters_vi ${stats.whyViCount}/${stats.whyTotal} (${stats.whyViCoverage}%) · nextWatchpoints_vi ${stats.watchViCount}/${stats.watchTotal} (${stats.watchViCoverage}%)`);
    for (const warning of warnings) console.log(`  ! WARN ${warning}`);
    if (errors.length) {
      failed = true;
      console.log(`\n  FAIL: ${errors.length} causal-quality error(s):`);
      for (const error of errors) console.log(`    x ${error}`);
    } else {
      console.log('  OK — causal layer passes its profile-aware quality gate.');
    }
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
