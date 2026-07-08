#!/usr/bin/env node
// Causal-quality gate for the worldcup-2026 pack.
//
// scripts/validate-pack.mjs proves the pack is STRUCTURALLY sound (ids resolve,
// enums in range, referential integrity). It does NOT prove the causal layer is
// real rather than templated — a pack of 104 "Scorers: …" whyItMatters lines and
// 20 identical `accelerated 0.62` links passes it cleanly. That is exactly the
// live regression this file exists to catch.
//
// This is the SEMANTIC gate: it fails a pack whose causal substrate is mechanical,
// backwards, or dishonest. Run it after validate-pack, before any push.
//
//   node scripts/causal-quality.mjs               # gate every pack that opts in
//   node scripts/causal-quality.mjs worldcup-2026 # gate one pack
//   node scripts/causal-quality.mjs --from <dir>  # gate an exported dir
//
// Also exports assessCausalQuality({events,links,insights}) for in-memory use
// (so add-match-day.mjs can gate BEFORE writing to disk).
//
// Exit 0 = causal layer is real. Exit 1 = templated/broken (details printed).

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKS_DIR = join(ROOT, 'packs');

// Teams the UI can resolve to a flag + 3-letter code. Kept in sync with the
// CODE/ISO2/NAME_ALIASES maps in apps/saas/public/embed/wc-bracket.html: a team
// name that is not here (nor an alias) renders as a grey fallback pill on the
// public bracket — a visible quality failure. Update BOTH when the field changes.
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
// Round labels the bracket's canonRound() accepts (ROUND_ALIASES in wc-bracket.html).
const KNOWN_ROUNDS = new Set([
  'round of 32', 'r32', '1/16', 'last 32',
  'round of 16', 'r16', 'last 16', '1/8',
  'quarter-final', 'quarterfinal', 'quarter final', 'quarter-finals', 'quarterfinals', 'qf', '1/4',
  'semi-final', 'semifinal', 'semi final', 'semi-finals', 'semifinals', 'sf',
  'match for third place', 'third place', 'third-place play-off', '3rd place', 'bronze final',
  'final',
]);
// A group label (Group A … Group L) is a legal entity too — it is not a round.
const GROUP_RE = /^group [a-l]$/i;

function canonTeam(n) {
  const s = String(n ?? '').trim();
  if (KNOWN_TEAMS.has(s)) return s;
  return TEAM_ALIASES[s.toLowerCase()] || null;
}
function isKnownEntity(e) {
  const s = String(e ?? '').trim();
  if (!s) return false;
  if (GROUP_RE.test(s)) return true;
  if (KNOWN_ROUNDS.has(s.toLowerCase())) return true;
  if (canonTeam(s)) return true;
  // Venues / other free-text entities are allowed — we only hard-check that the
  // TEAM entities of a knockout tie resolve (see below); this keeps the gate
  // strict where the UI is strict and lenient where it renders free text.
  return null; // "unknown, but maybe a venue" — handled by the caller
}

// Parse "A n–m B" (optionally "(x–y pens)") out of a completed-match title, the
// same regex the bracket uses (tie()). Returns {a,b,sa,sb,penA,penB} or null.
const TITLE_RE = /^(.*?)\s+(\d{1,2})\s*[–-]\s*(\d{1,2})(?:\s*\(\s*(\d{1,2})\s*[–-]\s*(\d{1,2})\s*pens?\.?\s*\))?\s+(.*)$/;
function parseTitle(title) {
  const m = String(title ?? '').match(TITLE_RE);
  if (!m) return null;
  return {
    a: m[1].trim(), sa: +m[2], sb: +m[3],
    penA: m[4] != null ? +m[4] : null, penB: m[5] != null ? +m[5] : null,
    b: m[6].trim(),
  };
}
function winnerOf(p) {
  if (p.sa !== p.sb) return p.sa > p.sb ? p.a : p.b;
  if (p.penA != null && p.penA !== p.penB) return p.penA > p.penB ? p.a : p.b;
  return null; // an honest draw (group stage) — no single winner
}

// Any scoreline "n–m" or "n-m" appearing in free text (to catch a scheduled
// event that leaked a result, or evidence that contradicts the title).
const ANY_SCORE_RE = /\b(\d{1,2})\s*[–-]\s*(\d{1,2})\b/;

const TEMPLATED_WHY = [
  /^scorers:/i,           // the live-bug template
  /^full-time\s+\d/i,     // ingest fallback template
  /^upcoming\s+.*match/i, // scheduled fallback template
];

/**
 * Assess the causal quality of an in-memory pack. Returns
 * { errors, warnings, stats }. `errors` non-empty ⇒ the gate fails.
 * Pure: no I/O, no console — safe to call before writing to disk.
 */
export function assessCausalQuality({ events, links, insights }, packId = 'pack') {
  const errors = [];
  const warnings = [];
  const E = (m) => errors.push(`[${packId}] ${m}`);
  const W = (m) => warnings.push(`[${packId}] ${m}`);

  const evList = Array.isArray(events) ? events : [];
  const lkList = Array.isArray(links) ? links : [];

  const live = evList.filter((e) => e && e.status);        // day-scale fixtures
  const completed = live.filter((e) => e.status === 'completed');
  const scheduled = live.filter((e) => e.status === 'scheduled' || e.status === 'live');

  // ── 1. whyItMatters must be real, not a template ─────────────────────────
  let templatedWhy = 0;
  for (const e of live) {
    const why = String(e.whyItMatters ?? '');
    if (TEMPLATED_WHY.some((re) => re.test(why))) {
      templatedWhy++;
      E(`event ${e.id}: whyItMatters is templated ("${why.slice(0, 40)}…") — write real stakes / what it changes / what it sets up`);
    } else if (e.status === 'completed' && why.trim().length < 40) {
      W(`event ${e.id}: whyItMatters is very short (${why.trim().length} chars) — likely thin`);
    }
  }

  // ── 2. completed events must carry a parseable scoreline + honest attribution ─
  // A link can touch two completed events (both endpoints played) — report each
  // backwards-scoreline link at most once across the whole pass.
  const reportedBackwards = new Set();
  for (const e of completed) {
    const p = parseTitle(e.title);
    if (!p) {
      E(`event ${e.id}: completed match title "${e.title}" has no parseable "A n–m B" scoreline`);
      continue;
    }
    // 2a. backwards-scoreline bug: any link touching this event whose evidence
    // names the winner with the LOSER's scoreline (the "Mexico's 0–3 win" live bug).
    const winner = winnerOf(p);
    if (winner) {
      const touching = lkList.filter((l) => l.fromEvent === e.id || l.toEvent === e.id);
      for (const l of touching) {
        if (reportedBackwards.has(l.id)) continue;
        const ev = String(l.evidence ?? '');
        // evidence of the form "<winner>'s a–b win" must state the winner's own
        // margin (higher–lower), never the reversed pair from a losing-order title.
        // The [’'] class covers a curly or straight apostrophe after the team name.
        const claim = new RegExp(`${escapeRe(winner)}['’]?s\\s+(\\d{1,2})\\s*[–-]\\s*(\\d{1,2})\\s+win`, 'i');
        const mm = ev.match(claim);
        if (mm && +mm[1] < +mm[2]) {
          reportedBackwards.add(l.id);
          E(`link ${l.id}: evidence says "${winner}'s ${mm[1]}–${mm[2]} win" but a win means the winner's score is higher — backwards scoreline (the live "Mexico's 0–3 win" bug)`);
        }
      }
    }
  }

  // ── 3. scheduled events must NOT carry a result ──────────────────────────
  for (const e of scheduled) {
    const sm = String(e.title ?? '').match(ANY_SCORE_RE);
    if (sm && parseTitle(e.title)) {
      E(`event ${e.id}: status="${e.status}" but the title "${e.title}" carries a scoreline — a scheduled fixture has no result`);
    }
  }

  // ── 4. round + team entities must resolve to the UI's maps ───────────────
  for (const e of live) {
    const ents = Array.isArray(e.entities) ? e.entities : [];
    const roundEnts = ents.filter((x) => KNOWN_ROUNDS.has(String(x).trim().toLowerCase()));
    const isKnockout = roundEnts.length > 0
      || /\b(round of 32|round of 16|quarter|semi|final|third place)\b/i.test(String(e.title ?? ''));
    // Unrecognized round label that LOOKS like a round → fail (would drop off the bracket).
    for (const x of ents) {
      const s = String(x).trim();
      if (GROUP_RE.test(s) || KNOWN_ROUNDS.has(s.toLowerCase()) || canonTeam(s)) continue;
      // heuristic: strings mentioning "final"/"round"/"quarter"/"semi" but not canonical
      if (/\b(final|round|quarter|semi|last \d|1\/\d)\b/i.test(s) && !KNOWN_ROUNDS.has(s.toLowerCase())) {
        E(`event ${e.id}: entity "${s}" looks like a round label but is not one canonRound() accepts`);
      }
    }
    // A knockout tie's two team entities must resolve to the CODE/ISO2 maps —
    // an unresolved team renders as a grey fallback pill on the public bracket.
    // We only hard-fail entities that clearly ARE team names (title-case, short,
    // not a venue) so a free-text venue entity never trips the gate.
    if (isKnockout) {
      const teamEnts = ents.filter((x) => !GROUP_RE.test(String(x)) && !KNOWN_ROUNDS.has(String(x).trim().toLowerCase()));
      const looksLikeTeam = (x) => /^[A-Z][a-zé&' -]{1,28}$/.test(String(x).trim())
        && !/stadium|arena|park|field|metlife|azteca|bay area|new jersey|city|angeles|francisco/i.test(x);
      for (const x of teamEnts) {
        if (canonTeam(x)) continue;
        if (looksLikeTeam(x)) {
          E(`event ${e.id}: knockout entity "${x}" does not resolve to a known team or alias — it would render as a grey fallback pill on the public bracket`);
        }
      }
    }
  }

  // ── 5. relationship variety — no single verb may dominate ────────────────
  const rels = lkList.map((l) => l.relationship);
  const relCounts = countBy(rels);
  const distinctRels = Object.keys(relCounts).length;
  if (lkList.length >= 8) {
    const [topRel, topN] = Object.entries(relCounts).sort((a, b) => b[1] - a[1])[0] || ['', 0];
    const share = topN / lkList.length;
    if (share > 0.7) {
      E(`links: "${topRel}" is ${Math.round(share * 100)}% of all ${lkList.length} links (>70%) — a real causal graph uses varied relationships (caused/enabled/accelerated/inspired/delayed/prevented)`);
    }
    if (distinctRels < 3) {
      E(`links: only ${distinctRels} distinct relationship type(s) across ${lkList.length} links — need ≥3`);
    }
  }

  // ── 6. confidence variety — not every link at one value ──────────────────
  const confs = lkList.map((l) => l.confidence).filter((c) => typeof c === 'number');
  if (confs.length >= 8) {
    const distinctConf = new Set(confs.map((c) => c.toFixed(2))).size;
    if (distinctConf <= 1) {
      E(`links: every link has confidence ${confs[0]} — vary it honestly (caused 0.85-0.95, enabled 0.7-0.85, accelerated 0.5-0.7, inspired 0.4-0.7)`);
    } else if (distinctConf === 2 && confs.length >= 20) {
      W(`links: only ${distinctConf} distinct confidence values across ${confs.length} links — likely under-calibrated`);
    }
  }

  // ── 7. duplicated evidence strings (mechanical template tell) ────────────
  const evCounts = countBy(lkList.map((l) => normalizeEvidence(l.evidence)));
  for (const [ev, n] of Object.entries(evCounts)) {
    if (ev && n > 1) {
      E(`links: the same evidence sentence is reused ${n}× ("${ev.slice(0, 50)}…") — each causal claim needs its own specific evidence`);
    }
  }

  // ── 8. watchpoint coverage on completed matches ──────────────────────────
  const withWatch = completed.filter((e) => Array.isArray(e.nextWatchpoints) && e.nextWatchpoints.length > 0);
  const watchCoverage = completed.length ? withWatch.length / completed.length : 1;
  // 90% is the KR-001 bar; below 50% is a hard fail (the layer is effectively absent).
  if (completed.length >= 4 && watchCoverage < 0.5) {
    E(`nextWatchpoints: only ${withWatch.length}/${completed.length} completed matches (${Math.round(watchCoverage * 100)}%) carry watchpoints — the daily editorial must add 2-5 per completed match`);
  } else if (completed.length >= 4 && watchCoverage < 0.9) {
    W(`nextWatchpoints: ${withWatch.length}/${completed.length} completed matches (${Math.round(watchCoverage * 100)}%) carry watchpoints — target ≥90%`);
  }

  // ── 8b. bilingual coverage — every EN causal string wants a fluent VI twin ─
  // VI is ADDITIVE: a missing _vi falls back to English on the page, so these are
  // warnings (they degrade the page, they don't break it) — but the coverage % is
  // printed so a regression in the daily VI output is visible in CI.
  const sameText = (a, b) => normalizeEvidence(a) === normalizeEvidence(b) && String(a ?? '').trim() !== '';
  const withWhy = live.filter((e) => String(e.whyItMatters ?? '').trim() && !TEMPLATED_WHY.some((re) => re.test(String(e.whyItMatters))));
  let whyViCount = 0;
  for (const e of withWhy) {
    const vi = String(e.whyItMatters_vi ?? '').trim();
    if (!vi) { W(`event ${e.id}: has whyItMatters but no whyItMatters_vi — a Vietnamese reader sees English fallback`); continue; }
    whyViCount++;
    if (sameText(e.whyItMatters_vi, e.whyItMatters)) {
      W(`event ${e.id}: whyItMatters_vi is identical to the English — it was not actually translated`);
    }
  }
  const withWatchAll = live.filter((e) => Array.isArray(e.nextWatchpoints) && e.nextWatchpoints.length > 0);
  let watchViCount = 0;
  for (const e of withWatchAll) {
    const vi = e.nextWatchpoints_vi;
    if (!Array.isArray(vi) || vi.length === 0) { W(`event ${e.id}: has nextWatchpoints but no nextWatchpoints_vi`); continue; }
    if (vi.length !== e.nextWatchpoints.length) {
      W(`event ${e.id}: nextWatchpoints_vi has ${vi.length} item(s) but nextWatchpoints has ${e.nextWatchpoints.length} — one VI string per EN watchpoint`);
    }
    watchViCount++;
    const identical = vi.every((v, i) => sameText(v, e.nextWatchpoints[i]));
    if (identical) W(`event ${e.id}: nextWatchpoints_vi is identical to the English — not actually translated`);
  }
  const whyViCoverage = withWhy.length ? whyViCount / withWhy.length : 1;
  const watchViCoverage = withWatchAll.length ? watchViCount / withWatchAll.length : 1;

  // ── 9. lineage + insight presence (the substrate must not be empty) ──────
  const lineage = evList.filter((e) => !e.status && !e.date); // static history-spine events
  if (lineage.length === 0) {
    W(`lineage: 0 history-spine events — the 160-year World Cup lineage is not present (historical-resonance links have nothing to point at)`);
  }
  if ((insights?.length ?? 0) < 2) {
    W(`insights: only ${insights?.length ?? 0} pattern(s) — the pattern lens is thin (curated pack ships 5)`);
  }

  const stats = {
    events: evList.length, live: live.length, completed: completed.length,
    scheduled: scheduled.length, links: lkList.length, insights: insights?.length ?? 0,
    lineage: lineage.length, distinctRels, relCounts,
    distinctConf: new Set(confs.map((c) => c.toFixed(2))).size,
    templatedWhy, watchCoverage: Math.round(watchCoverage * 100),
    whyViCoverage: Math.round(whyViCoverage * 100),
    watchViCoverage: Math.round(watchViCoverage * 100),
    whyViCount, whyTotal: withWhy.length, watchViCount, watchTotal: withWatchAll.length,
  };
  return { errors, warnings, stats };
}

function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function countBy(arr) { const o = {}; for (const x of arr) o[x] = (o[x] || 0) + 1; return o; }
function normalizeEvidence(s) { return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' '); }

function readPackFromDisk(packId) {
  const dir = join(PACKS_DIR, packId);
  const read = (n) => JSON.parse(readFileSync(join(dir, n), 'utf8'));
  return { events: read('events.json'), links: read('links.json'), insights: read('insights.json') };
}

function main() {
  const args = process.argv.slice(2);
  const fromIdx = args.indexOf('--from');
  const fromDir = fromIdx !== -1 ? args[fromIdx + 1] : null;
  const packId = args.find((a) => !a.startsWith('--') && a !== fromDir);

  let targets;
  if (fromDir) {
    const read = (n) => JSON.parse(readFileSync(join(fromDir, n), 'utf8'));
    targets = [[packId || fromDir, { events: read('events.json'), links: read('links.json'), insights: read('insights.json') }]];
  } else if (packId) {
    targets = [[packId, readPackFromDisk(packId)]];
  } else {
    // Every pack under packs/ that carries live events opts in automatically.
    if (!existsSync(PACKS_DIR)) { console.error('No packs/ directory.'); process.exit(1); }
    targets = readdirSync(PACKS_DIR)
      .filter((d) => statSync(join(PACKS_DIR, d)).isDirectory())
      .map((id) => [id, readPackFromDisk(id)])
      .filter(([, p]) => p.events.some((e) => e.status));
  }

  let failed = false;
  for (const [id, pack] of targets) {
    const { errors, warnings, stats } = assessCausalQuality(pack, id);
    console.log(`\n=== causal-quality: ${id} ===`);
    console.log(`  events=${stats.events} (completed ${stats.completed}, scheduled ${stats.scheduled}) links=${stats.links} insights=${stats.insights} lineage=${stats.lineage}`);
    console.log(`  relationships=${stats.distinctRels} distinct ${JSON.stringify(stats.relCounts)} · confidence=${stats.distinctConf} distinct`);
    console.log(`  templated whyItMatters=${stats.templatedWhy} · watchpoint coverage=${stats.watchCoverage}%`);
    console.log(`  VI coverage: whyItMatters_vi ${stats.whyViCount}/${stats.whyTotal} (${stats.whyViCoverage}%) · nextWatchpoints_vi ${stats.watchViCount}/${stats.watchTotal} (${stats.watchViCoverage}%)`);
    for (const w of warnings) console.log(`  ! WARN ${w}`);
    if (errors.length) {
      failed = true;
      console.log(`\n  FAIL: ${errors.length} causal-quality error(s):`);
      for (const e of errors) console.log(`    x ${e}`);
    } else {
      console.log('  OK — causal layer is real, not templated.');
    }
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
