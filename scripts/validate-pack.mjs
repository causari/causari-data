#!/usr/bin/env node
// Zero-dependency validator for Causari data packs.
//
// Checks each pack under packs/<id>/ for schema conformance AND referential
// integrity (the part JSON Schema can't express): every link endpoint must be a
// real event, every insight instance must be a real link, ids must be unique and
// well-formed. Optional manifest.json and views.json files are also checked when
// present so Canvas projections cannot silently reference missing graph nodes.
// Run before every commit that touches a pack — this is what keeps live updates
// from shipping a broken graph to the public visual.
//
//   node scripts/validate-pack.mjs            # validate all packs
//   node scripts/validate-pack.mjs worldcup-2026
//
// Also exports validatePackData({events,links,insights,views,manifest,claims,evidence,sources,forecasts}) for
// in-memory checks. Optional files may be omitted by existing callers.
//
// Exit 0 = clean, exit 1 = errors found.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKS_DIR = join(ROOT, 'packs');

const DOMAINS = new Set([
  'technology', 'humanities', 'systems', 'science', 'economy',
  'geopolitics', 'philosophy', 'environment', 'culture', 'health',
]);
const RELATIONSHIPS = new Set(['caused', 'enabled', 'accelerated', 'inspired', 'delayed', 'prevented']);
const PRECISIONS = new Set(['millennium', 'century', 'decade', 'year', 'month', 'day']);
const STATUSES = new Set(['completed', 'scheduled', 'live', 'forecast']); // optional live-event field
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PATTERN_ID = /^pattern--[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isNum01(v) { return typeof v === 'number' && v >= 0 && v <= 1; }
function isNonEmptyStr(v) { return typeof v === 'string' && v.trim().length > 0; }

/**
 * Pure validation of a pack's in-memory data. Returns an array of error strings
 * (empty = valid). No I/O, no console — safe to call before writing to disk.
 */
export function validatePackData({ events, links, insights, views, manifest, claims, evidence, sources, forecasts }, packId = 'pack') {
  const errors = [];
  const E = (msg) => errors.push(`[${packId}] ${msg}`);
  const eventIds = new Set();
  const linkIds = new Set();
  const viewIds = new Set();
  const sourceIds = new Set();
  const evidenceIds = new Set();
  const claimIds = new Set();

  // --- Events ---
  if (!Array.isArray(events)) { E('events must be an array'); return errors; }
  for (const ev of events) {
    const id = ev?.id ?? '<missing id>';
    if (!isNonEmptyStr(ev.id)) E('event has no id');
    else if (!KEBAB.test(ev.id)) E(`event id not kebab-case: ${ev.id}`);
    else if (eventIds.has(ev.id)) E(`duplicate event id: ${ev.id}`);
    else eventIds.add(ev.id);
    if (!isNonEmptyStr(ev.title)) E(`event ${id}: missing title`);
    if (!isNonEmptyStr(ev.description)) E(`event ${id}: missing description`);
    if (typeof ev.yearNum !== 'number') E(`event ${id}: yearNum must be a number`);
    if (!isNonEmptyStr(ev.yearLabel)) E(`event ${id}: missing yearLabel`);
    if (!PRECISIONS.has(ev.precision)) E(`event ${id}: invalid precision "${ev.precision}"`);
    if (!Array.isArray(ev.domains) || ev.domains.length === 0) E(`event ${id}: domains must be a non-empty array`);
    else for (const d of ev.domains) if (!DOMAINS.has(d)) E(`event ${id}: invalid domain "${d}"`);
    if (!isNum01(ev.impactScore)) E(`event ${id}: impactScore must be 0-1`);
    if (!Array.isArray(ev.tags)) E(`event ${id}: tags must be an array`);
    // optional live-event fields
    if (ev.status !== undefined && !STATUSES.has(ev.status)) E(`event ${id}: invalid status "${ev.status}"`);
    if (ev.entities !== undefined && !Array.isArray(ev.entities)) E(`event ${id}: entities must be an array`);
    if (ev.nextWatchpoints !== undefined && !Array.isArray(ev.nextWatchpoints)) E(`event ${id}: nextWatchpoints must be an array`);
    if (ev.forecastConfidence !== undefined && !isNum01(ev.forecastConfidence)) E(`event ${id}: forecastConfidence must be 0-1`);
  }

  // --- Links (referential integrity is the point) ---
  if (!Array.isArray(links)) { E('links must be an array'); return errors; }
  for (const ln of links) {
    const id = ln?.id ?? '<missing id>';
    if (!isNonEmptyStr(ln.id)) E('link has no id');
    else if (linkIds.has(ln.id)) E(`duplicate link id: ${ln.id}`);
    else linkIds.add(ln.id);
    if (!RELATIONSHIPS.has(ln.relationship)) E(`link ${id}: invalid relationship "${ln.relationship}"`);
    if (!isNum01(ln.confidence)) E(`link ${id}: confidence must be 0-1`);
    if (!isNonEmptyStr(ln.evidence)) E(`link ${id}: missing evidence`);
    // endpoints MUST be real events
    if (!eventIds.has(ln.fromEvent)) E(`link ${id}: fromEvent "${ln.fromEvent}" is not an event in this pack`);
    if (!eventIds.has(ln.toEvent)) E(`link ${id}: toEvent "${ln.toEvent}" is not an event in this pack`);
    // id must encode {from}--{rel}-->{to}
    const expected = `${ln.fromEvent}--${ln.relationship}-->${ln.toEvent}`;
    if (ln.id !== expected) E(`link ${id}: id should be "${expected}"`);
  }

  // --- Insights (instances must be real links) ---
  if (!Array.isArray(insights)) { E('insights must be an array'); return errors; }
  const insightIds = new Set();
  for (const ins of insights) {
    const id = ins?.id ?? '<missing id>';
    if (!isNonEmptyStr(ins.id)) E('insight has no id');
    else if (!PATTERN_ID.test(ins.id)) E(`insight ${id}: id should follow "pattern--{kebab-name}"`);
    else if (insightIds.has(ins.id)) E(`duplicate insight id: ${ins.id}`);
    else insightIds.add(ins.id);
    if (!isNonEmptyStr(ins.pattern)) E(`insight ${id}: missing pattern name`);
    if (!isNonEmptyStr(ins.description)) E(`insight ${id}: missing description`);
    if (!isNum01(ins.predictiveValue)) E(`insight ${id}: predictiveValue must be 0-1`);
    if (!Array.isArray(ins.domains) || ins.domains.length === 0) E(`insight ${id}: domains must be a non-empty array`);
    else for (const d of ins.domains) if (!DOMAINS.has(d)) E(`insight ${id}: invalid domain "${d}"`);
    if (!Array.isArray(ins.instances)) { E(`insight ${id}: instances must be an array`); continue; }
    for (const ref of ins.instances) {
      if (!linkIds.has(ref)) E(`insight ${id}: instance "${ref}" is not a link in this pack`);
    }
  }

  // --- Optional evidence-first case layer ---
  if (sources !== undefined) {
    if (!Array.isArray(sources)) E('sources must be an array when sources.json is present');
    else for (const source of sources) {
      const id = source?.id ?? '<missing id>';
      if (!isNonEmptyStr(source?.id)) E('source has no id');
      else if (!KEBAB.test(source.id)) E(`source id not kebab-case: ${source.id}`);
      else if (sourceIds.has(source.id)) E(`duplicate source id: ${source.id}`);
      else sourceIds.add(source.id);
      if (!isNonEmptyStr(source?.title)) E(`source ${id}: missing title`);
      if (source?.url !== undefined && !isNonEmptyStr(source.url)) E(`source ${id}: url must be a non-empty string`);
    }
  }

  if (evidence !== undefined) {
    if (!Array.isArray(evidence)) E('evidence must be an array when evidence.json is present');
    else for (const item of evidence) {
      const id = item?.id ?? '<missing id>';
      if (!isNonEmptyStr(item?.id)) E('evidence item has no id');
      else if (!KEBAB.test(item.id)) E(`evidence id not kebab-case: ${item.id}`);
      else if (evidenceIds.has(item.id)) E(`duplicate evidence id: ${item.id}`);
      else evidenceIds.add(item.id);
      if (!isNonEmptyStr(item?.sourceId)) E(`evidence ${id}: missing sourceId`);
      else if (!sourceIds.has(item.sourceId)) E(`evidence ${id}: sourceId "${item.sourceId}" is not in sources.json`);
      if (!isNonEmptyStr(item?.support)) E(`evidence ${id}: missing support text`);
      if (item?.confidence !== undefined && !isNum01(item.confidence)) E(`evidence ${id}: confidence must be 0-1`);
    }
  }

  if (claims !== undefined) {
    if (!Array.isArray(claims)) E('claims must be an array when claims.json is present');
    else for (const claim of claims) {
      const id = claim?.id ?? '<missing id>';
      if (!isNonEmptyStr(claim?.id)) E('claim has no id');
      else if (!KEBAB.test(claim.id)) E(`claim id not kebab-case: ${claim.id}`);
      else if (claimIds.has(claim.id)) E(`duplicate claim id: ${claim.id}`);
      else claimIds.add(claim.id);
      if (!isNonEmptyStr(claim?.text)) E(`claim ${id}: missing text`);
      if (!isNonEmptyStr(claim?.kind)) E(`claim ${id}: missing kind`);
      if (!isNonEmptyStr(claim?.status)) E(`claim ${id}: missing status`);
      if (!isNum01(claim?.confidence)) E(`claim ${id}: confidence must be 0-1`);
      if (!Array.isArray(claim?.eventIds)) E(`claim ${id}: eventIds must be an array`);
      else for (const ref of claim.eventIds) if (!eventIds.has(ref)) E(`claim ${id}: eventIds references missing event "${ref}"`);
      if (!Array.isArray(claim?.evidenceIds)) E(`claim ${id}: evidenceIds must be an array`);
      else for (const ref of claim.evidenceIds) if (!evidenceIds.has(ref)) E(`claim ${id}: evidenceIds references missing evidence "${ref}"`);
    }
  }

  if (forecasts !== undefined) {
    if (!Array.isArray(forecasts)) E('forecasts must be an array when forecasts.json is present');
    else for (const forecast of forecasts) {
      const id = forecast?.id ?? '<missing id>';
      if (!isNonEmptyStr(forecast?.id)) E('forecast has no id');
      else if (!KEBAB.test(forecast.id)) E(`forecast id not kebab-case: ${forecast.id}`);
      if (!isNonEmptyStr(forecast?.question)) E(`forecast ${id}: missing question`);
      if (forecast?.probability !== undefined && !isNum01(forecast.probability)) E(`forecast ${id}: probability must be 0-1`);
      if (forecast?.relatedEventIds !== undefined) {
        if (!Array.isArray(forecast.relatedEventIds)) E(`forecast ${id}: relatedEventIds must be an array`);
        else for (const ref of forecast.relatedEventIds) if (!eventIds.has(ref)) E(`forecast ${id}: relatedEventIds references missing event "${ref}"`);
      }
      for (const field of ['evidenceForIds', 'evidenceAgainstIds']) {
        if (forecast?.[field] === undefined) continue;
        if (!Array.isArray(forecast[field])) E(`forecast ${id}: ${field} must be an array`);
        else for (const ref of forecast[field]) if (!evidenceIds.has(ref)) E(`forecast ${id}: ${field} references missing evidence "${ref}"`);
      }
    }
  }

  // --- Optional Canvas/audience views ---
  if (views !== undefined) {
    if (!Array.isArray(views)) E('views must be an array when views.json is present');
    else {
      for (const view of views) {
        const id = view?.id ?? '<missing id>';
        if (!isNonEmptyStr(view.id)) E('view has no id');
        else if (!KEBAB.test(view.id)) E(`view id not kebab-case: ${view.id}`);
        else if (viewIds.has(view.id)) E(`duplicate view id: ${view.id}`);
        else viewIds.add(view.id);
        if (!isNonEmptyStr(view.title)) E(`view ${id}: missing title`);

        for (const field of ['focusEventIds', 'includeEventIds']) {
          if (view[field] === undefined) continue;
          if (!Array.isArray(view[field])) E(`view ${id}: ${field} must be an array`);
          else for (const ref of view[field]) {
            if (!eventIds.has(ref)) E(`view ${id}: ${field} references missing event "${ref}"`);
          }
        }

        if (view.highlightPaths !== undefined) {
          if (!Array.isArray(view.highlightPaths)) E(`view ${id}: highlightPaths must be an array`);
          else for (const [pathIndex, path] of view.highlightPaths.entries()) {
            if (!Array.isArray(path)) { E(`view ${id}: highlightPaths[${pathIndex}] must be an array`); continue; }
            for (const ref of path) {
              if (!eventIds.has(ref)) E(`view ${id}: highlightPaths[${pathIndex}] references missing event "${ref}"`);
            }
          }
        }
      }
    }
  }

  // --- Optional manifest ---
  if (manifest !== undefined) {
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) E('manifest must be an object when manifest.json is present');
    else {
      if (manifest.id !== undefined && manifest.id !== packId) E(`manifest id "${manifest.id}" must match pack directory "${packId}"`);
      const defaultView = manifest.canvas?.defaultView;
      if (defaultView !== undefined) {
        if (!isNonEmptyStr(defaultView)) E('manifest canvas.defaultView must be a non-empty string');
        else if (!Array.isArray(views)) E(`manifest defaultView "${defaultView}" requires views.json`);
        else if (!viewIds.has(defaultView)) E(`manifest defaultView "${defaultView}" is not defined in views.json`);
      }
    }
  }

  return errors;
}

/** Read a pack from disk and return { errors, counts }. */
export function validatePackFromDisk(packId) {
  const dir = join(PACKS_DIR, packId);
  const read = (name) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
  const readOptional = (name) => existsSync(join(dir, name)) ? read(name) : undefined;
  let data;
  try {
    data = {
      events: read('events.json'),
      links: read('links.json'),
      insights: read('insights.json'),
      views: readOptional('views.json'),
      manifest: readOptional('manifest.json'),
      claims: readOptional('claims.json'),
      evidence: readOptional('evidence.json'),
      sources: readOptional('sources.json'),
      forecasts: readOptional('forecasts.json'),
    };
  } catch (e) {
    return { errors: [`[${packId}] cannot read pack — ${e.message}`], counts: '' };
  }
  const errors = validatePackData(data, packId);
  const viewCount = Array.isArray(data.views) ? `, ${data.views.length} views` : '';
  const caseCount = [
    Array.isArray(data.claims) ? `${data.claims.length} claims` : '',
    Array.isArray(data.evidence) ? `${data.evidence.length} evidence` : '',
    Array.isArray(data.sources) ? `${data.sources.length} sources` : '',
    Array.isArray(data.forecasts) ? `${data.forecasts.length} forecasts` : '',
  ].filter(Boolean).join(', ');
  const counts = `${data.events.length} events, ${data.links.length} links, ${data.insights.length} insights${viewCount}${caseCount ? ', ' + caseCount : ''}`;
  return { errors, counts };
}

function main() {
  const arg = process.argv[2];
  if (!existsSync(PACKS_DIR)) { console.error('No packs/ directory found.'); process.exit(1); }
  const packIds = arg
    ? [arg]
    : readdirSync(PACKS_DIR).filter((d) => statSync(join(PACKS_DIR, d)).isDirectory());
  if (packIds.length === 0) { console.log('No packs to validate.'); return; }

  const errors = [];
  console.log(`Validating ${packIds.length} pack(s):`);
  for (const id of packIds) {
    const { errors: errs, counts } = validatePackFromDisk(id);
    if (errs.length === 0) console.log(`  ✓ ${id}: ${counts}`);
    errors.push(...errs);
  }

  if (errors.length > 0) {
    console.error(`\n✗ ${errors.length} error(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log('\n✓ All packs valid.');
}

// Run as CLI only when invoked directly (not when imported).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
