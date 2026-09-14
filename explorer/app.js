const state = {
  pack: null,
  data: null,
  view: 'timeline',
  filters: { observed: true, inferred: true, speculative: true },
  claimSearch: '',
};

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

const pulseKey = 'causari:event-explorer:pulse:v1';
const pulse = loadPulse();

function loadPulse() {
  const fallback = {
    sessions: 0,
    startedAt: Date.now(),
    firstDetailMs: null,
    detailOpens: 0,
    evidenceOpens: 0,
    filterChanges: 0,
    searches: 0,
    tabVisits: { timeline: 0, graph: 0, claims: 0, forecasts: 0 },
  };
  try {
    const stored = JSON.parse(localStorage.getItem(pulseKey) || 'null');
    const next = stored && typeof stored === 'object' ? { ...fallback, ...stored } : fallback;
    next.sessions += 1;
    next.startedAt = Date.now();
    savePulse(next);
    return next;
  } catch {
    fallback.sessions = 1;
    return fallback;
  }
}

function savePulse(value = pulse) {
  try { localStorage.setItem(pulseKey, JSON.stringify(value)); } catch {}
}

function track(type, detail) {
  if (type === 'detail') {
    pulse.detailOpens += 1;
    if (pulse.firstDetailMs === null) pulse.firstDetailMs = Date.now() - pulse.startedAt;
  }
  if (type === 'evidence') pulse.evidenceOpens += 1;
  if (type === 'filter') pulse.filterChanges += 1;
  if (type === 'search') pulse.searches += 1;
  if (type === 'tab' && pulse.tabVisits[detail] !== undefined) pulse.tabVisits[detail] += 1;
  savePulse();
}

async function boot() {
  bindStaticEvents();
  try {
    const packs = await fetchJson('./packs.json');
    if (!Array.isArray(packs) || packs.length === 0) throw new Error('No packs are configured.');
    renderPackOptions(packs);
    const params = new URLSearchParams(location.search);
    const requested = params.get('pack');
    const initial = packs.find((p) => p.id === requested) || packs[0];
    $('packSelect').value = initial.id;
    await loadPack(initial);
  } catch (err) {
    showFatal(err);
  }
}

function bindStaticEvents() {
  document.querySelectorAll('.tab').forEach((button) => {
    button.addEventListener('click', () => setView(button.dataset.view));
  });

  ['Observed', 'Inferred', 'Speculative'].forEach((name) => {
    const key = name.toLowerCase();
    $('filter' + name).addEventListener('change', (event) => {
      state.filters[key] = event.target.checked;
      track('filter');
      renderAll();
    });
  });

  $('claimSearch').addEventListener('input', (event) => {
    state.claimSearch = event.target.value.trim().toLowerCase();
    track('search');
    renderClaims();
  });

  $('packSelect').addEventListener('change', async (event) => {
    const option = event.target.selectedOptions[0];
    const pack = JSON.parse(option.dataset.pack);
    await loadPack(pack);
    const url = new URL(location.href);
    url.searchParams.set('pack', pack.id);
    history.replaceState(null, '', url);
  });

  $('openPrimer').addEventListener('click', () => $('primerDialog').showModal());
  $('sessionPulse').addEventListener('click', showPulse);
  $('resetPulse').addEventListener('click', () => {
    localStorage.removeItem(pulseKey);
    location.reload();
  });
  $('closeDrawer').addEventListener('click', closeDrawer);
  $('drawerBackdrop').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeDrawer();
  });
}

function renderPackOptions(packs) {
  $('packSelect').replaceChildren(...packs.map((pack) => {
    const option = el('option', '', pack.title);
    option.value = pack.id;
    option.dataset.pack = JSON.stringify(pack);
    return option;
  }));
}

async function loadPack(pack) {
  state.pack = pack;
  const base = pack.base.replace(/\/$/, '');
  const fileNames = ['manifest', 'events', 'links', 'insights', 'claims', 'evidence', 'sources', 'forecasts'];
  const entries = await Promise.all(fileNames.map(async (name) => {
    try { return [name, await fetchJson(base + '/' + name + '.json')]; }
    catch (err) {
      if (['insights', 'claims', 'evidence', 'sources', 'forecasts'].includes(name)) return [name, []];
      throw err;
    }
  }));
  state.data = Object.fromEntries(entries);
  assertPackIntegrity(state.data);
  renderAll();
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load ' + url + ' (' + res.status + ')');
  return res.json();
}

function assertPackIntegrity(data) {
  if (!data.manifest || !Array.isArray(data.events) || !Array.isArray(data.links)) {
    throw new Error('Pack is missing manifest, events, or links.');
  }
  const eventIds = new Set(data.events.map((x) => x.id));
  const sourceIds = new Set(data.sources.map((x) => x.id));
  const evidenceIds = new Set(data.evidence.map((x) => x.id));
  const problems = [];

  data.links.forEach((link) => {
    if (!eventIds.has(link.fromEvent) || !eventIds.has(link.toEvent)) problems.push('Dangling link: ' + link.id);
  });
  data.evidence.forEach((item) => {
    if (!sourceIds.has(item.sourceId)) problems.push('Evidence ' + item.id + ' has missing source ' + item.sourceId);
  });
  data.claims.forEach((claim) => {
    (claim.evidenceIds || []).forEach((id) => { if (!evidenceIds.has(id)) problems.push('Claim ' + claim.id + ' has missing evidence ' + id); });
  });

  if (problems.length) throw new Error(problems.join('; '));
}

function renderAll() {
  if (!state.data) return;
  renderHero();
  renderTimeline();
  renderGraph();
  renderClaims();
  renderForecasts();
}

function renderHero() {
  const { manifest, events, claims, evidence, forecasts } = state.data;
  $('packTitle').textContent = manifest.title;
  $('packDescription').textContent = manifest.description_vi || manifest.description;
  $('packMeta').replaceChildren(
    metaPill('As of', manifest.asOf || '—'),
    metaPill('Events', events.length),
    metaPill('Claims', claims.length),
    metaPill('Evidence', evidence.length),
    metaPill('Forecasts', forecasts.length),
  );

  const counts = countClaimStatuses(claims);
  $('metricObserved').textContent = counts.observed;
  $('metricInferred').textContent = counts.inferred;
  $('metricSpeculative').textContent = counts.speculative;
  const observedConfidence = claims.filter((c) => c.status === 'observed').reduce((sum, c) => sum + c.confidence, 0);
  const observedCount = Math.max(1, counts.observed);
  $('trustScore').textContent = Math.round((observedConfidence / observedCount) * 100) + '% source-backed';
}

function metaPill(label, value) {
  const node = el('span', 'meta-pill');
  node.innerHTML = '<span>' + escapeHtml(String(label)) + '</span><b>' + escapeHtml(String(value)) + '</b>';
  return node;
}

function countClaimStatuses(claims) {
  return claims.reduce((acc, claim) => {
    if (acc[claim.status] !== undefined) acc[claim.status] += 1;
    return acc;
  }, { observed: 0, inferred: 0, speculative: 0 });
}

function setView(view) {
  state.view = view;
  document.querySelectorAll('.tab').forEach((button) => button.classList.toggle('is-active', button.dataset.view === view));
  document.querySelectorAll('.view-panel').forEach((panel) => panel.classList.toggle('is-active', panel.id === 'view-' + view));
  track('tab', view);
}

function renderTimeline() {
  const timeline = $('timeline');
  const events = [...state.data.events].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  if (!events.length) {
    timeline.innerHTML = '<div class="empty-state">No timeline events.</div>';
    return;
  }

  timeline.replaceChildren(...events.map((event) => {
    const row = el('article', 'timeline-item');
    const date = el('div', 'timeline-date', event.dateLabel || event.yearLabel);
    const marker = el('div', 'timeline-marker');
    marker.appendChild(el('span', 'timeline-dot'));
    const card = el('div', 'event-card');
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', 'Open event ' + event.title);

    const claims = claimsForEvent(event.id).filter(isVisibleClaim);
    const top = el('div', 'event-card-top');
    const titleWrap = el('div');
    titleWrap.append(el('h3', '', event.title), el('p', '', event.description));
    const impact = el('div', 'impact');
    impact.innerHTML = '<span>impact</span><span class="impact-bar"><span class="impact-fill" style="width:' + Math.round((event.impactScore || 0) * 100) + '%"></span></span><span>' + Math.round((event.impactScore || 0) * 100) + '</span>';
    top.append(titleWrap, impact);

    const footer = el('div', 'event-footer');
    const entities = el('div', 'entity-row');
    (event.entities || []).slice(0, 4).forEach((entity) => entities.appendChild(el('span', 'entity-chip', entity)));
    const cue = el('span', 'open-cue', claims.length + ' visible claim' + (claims.length === 1 ? '' : 's') + ' →');
    footer.append(entities, cue);
    card.append(top, footer);

    const open = () => openEvent(event);
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') open(); });
    row.append(date, marker, card);
    return row;
  }));
}

function renderGraph() {
  const graph = $('graph');
  const links = state.data.links.filter((link) => state.filters[link.epistemicStatus || 'inferred'] !== false);
  const events = [...state.data.events].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  $('graphLegend').replaceChildren(
    statusBadge('observed', 'event fact'),
    statusBadge('inferred', 'causal edge'),
    el('span', 'meta-pill', 'Dashed edge = inference'),
  );

  const width = Math.max(920, events.length * 250);
  const height = 410;
  const positions = new Map(events.map((event, i) => [event.id, { x: 50 + i * 225, y: i % 2 === 0 ? 80 : 235 }]));
  const svgParts = [
    '<svg viewBox="0 0 ' + width + ' ' + height + '" xmlns="http://www.w3.org/2000/svg">',
    '<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="rgba(158,179,173,.55)"/></marker></defs>',
  ];

  links.forEach((link) => {
    const a = positions.get(link.fromEvent); const b = positions.get(link.toEvent);
    if (!a || !b) return;
    const x1 = a.x + 170, y1 = a.y + 46, x2 = b.x, y2 = b.y + 46;
    const mx = (x1 + x2) / 2;
    const path = 'M ' + x1 + ' ' + y1 + ' C ' + mx + ' ' + y1 + ', ' + mx + ' ' + y2 + ', ' + x2 + ' ' + y2;
    svgParts.push('<path class="graph-edge ' + escapeAttr(link.epistemicStatus || 'inferred') + '" d="' + path + '"/>');
    svgParts.push('<text class="graph-edge-label" x="' + mx + '" y="' + ((y1+y2)/2 - 8) + '" text-anchor="middle">' + escapeHtml(link.relationship) + ' · ' + Math.round(link.confidence*100) + '%</text>');
  });

  events.forEach((event) => {
    const p = positions.get(event.id);
    const titleLines = wrapText(event.title, 24, 2);
    svgParts.push('<g class="graph-node" data-event-id="' + escapeAttr(event.id) + '" transform="translate(' + p.x + ',' + p.y + ')">');
    svgParts.push('<rect width="170" height="92" rx="14"/>');
    svgParts.push('<circle cx="15" cy="18" r="4"/>');
    svgParts.push('<text class="node-date" x="27" y="21">' + escapeHtml(event.dateLabel || event.yearLabel) + '</text>');
    titleLines.forEach((line, idx) => svgParts.push('<text class="node-title" x="15" y="' + (47 + idx*18) + '">' + escapeHtml(line) + '</text>'));
    svgParts.push('</g>');
  });
  svgParts.push('</svg>');
  graph.innerHTML = svgParts.join('');
  graph.querySelectorAll('[data-event-id]').forEach((node) => node.addEventListener('click', () => {
    const event = state.data.events.find((x) => x.id === node.dataset.eventId);
    if (event) openEvent(event);
  }));
}

function wrapText(text, max, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  words.forEach((word) => {
    const next = line ? line + ' ' + word : word;
    if (next.length > max && line) { lines.push(line); line = word; }
    else line = next;
  });
  if (line) lines.push(line);
  const out = lines.slice(0, maxLines);
  if (lines.length > maxLines) out[maxLines - 1] = out[maxLines - 1].replace(/[.…]+$/, '') + '…';
  return out;
}

function renderClaims() {
  const root = $('claims');
  let claims = state.data.claims.filter(isVisibleClaim);
  if (state.claimSearch) {
    claims = claims.filter((claim) => (claim.text + ' ' + claim.kind + ' ' + claim.status + ' ' + (claim.notes || '')).toLowerCase().includes(state.claimSearch));
  }
  claims.sort((a, b) => statusRank(a.status) - statusRank(b.status) || b.confidence - a.confidence);
  $('claimCount').textContent = claims.length + ' of ' + state.data.claims.length + ' claims';
  if (!claims.length) {
    root.innerHTML = '<div class="empty-state">No claims match the current lens.</div>';
    return;
  }
  root.replaceChildren(...claims.map((claim) => {
    const card = el('article', 'claim-card');
    card.tabIndex = 0;
    const badge = statusBadge(claim.status, claim.status);
    const main = el('div', 'claim-main');
    main.append(el('div', 'claim-text', claim.text), el('p', '', claim.kind + ' · ' + (claim.evidenceIds || []).length + ' evidence item' + ((claim.evidenceIds || []).length === 1 ? '' : 's')));
    const conf = el('div', 'confidence');
    conf.innerHTML = '<strong>' + Math.round(claim.confidence * 100) + '%</strong><span>confidence</span>';
    const open = () => openClaim(claim);
    card.addEventListener('click', open);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') open(); });
    card.append(badge, main, conf);
    return card;
  }));
}

function renderForecasts() {
  const root = $('forecasts');
  const forecasts = state.data.forecasts || [];
  if (!forecasts.length) {
    root.innerHTML = '<div class="empty-state">No forecasts in this pack.</div>';
    return;
  }
  root.replaceChildren(...forecasts.map((forecast) => {
    const card = el('article', 'forecast-card');
    const pct = Math.round(forecast.probability * 100);
    card.innerHTML =
      '<div class="forecast-prob"><strong>' + pct + '%</strong><span>' + escapeHtml(forecast.status) + ' · resolve by ' + escapeHtml(formatDate(forecast.deadline)) + '</span></div>' +
      '<div class="prob-bar"><div class="prob-fill" style="width:' + pct + '%"></div></div>' +
      '<h3>' + escapeHtml(forecast.question) + '</h3>' +
      '<div class="forecast-detail"><strong>Resolution criteria</strong><p>' + escapeHtml(forecast.resolutionCriteria) + '</p></div>';
    return card;
  }));
}

function claimsForEvent(eventId) {
  return state.data.claims.filter((claim) => (claim.eventIds || []).includes(eventId));
}

function evidenceForClaim(claim) {
  const ids = new Set(claim.evidenceIds || []);
  return state.data.evidence.filter((item) => ids.has(item.id));
}

function sourceForEvidence(item) {
  return state.data.sources.find((source) => source.id === item.sourceId);
}

function isVisibleClaim(claim) {
  return state.filters[claim.status] !== false;
}

function statusRank(status) {
  return ({ observed: 0, inferred: 1, speculative: 2 })[status] ?? 9;
}

function statusBadge(status, label = status) {
  const badge = el('span', 'status-badge ' + status);
  badge.append(el('span', 'status-dot'), document.createTextNode(label));
  return badge;
}

function openEvent(event) {
  track('detail');
  $('drawerKicker').textContent = event.dateLabel || event.yearLabel;
  $('drawerTitle').textContent = event.title;
  const body = $('drawerBody');
  body.replaceChildren();

  body.append(
    detailSection('What happened', el('p', 'detail-copy', event.description)),
    detailSection('Why it matters', el('div', 'why-box', event.whyItMatters || 'No interpretation provided.')),
  );

  const claims = claimsForEvent(event.id).filter(isVisibleClaim);
  const claimWrap = el('div');
  if (!claims.length) claimWrap.append(el('div', 'empty-state', 'No claims visible under the current epistemic lens.'));
  claims.forEach((claim) => {
    const item = el('button', 'claim-card');
    item.type = 'button';
    item.style.width = '100%';
    item.style.marginBottom = '8px';
    item.style.textAlign = 'left';
    item.append(statusBadge(claim.status), el('div', 'claim-text', claim.text));
    const conf = el('div', 'confidence');
    conf.innerHTML = '<strong>' + Math.round(claim.confidence*100) + '%</strong><span>confidence</span>';
    item.append(conf);
    item.addEventListener('click', () => openClaim(claim));
    claimWrap.append(item);
  });
  body.append(detailSection('Claims (' + claims.length + ')', claimWrap));

  const outgoing = state.data.links.filter((link) => link.fromEvent === event.id);
  if (outgoing.length) {
    const list = el('div');
    outgoing.forEach((link) => {
      const target = state.data.events.find((x) => x.id === link.toEvent);
      const card = el('div', 'evidence-card');
      card.innerHTML = '<div class="evidence-card-head"><strong>' + escapeHtml(link.relationship) + ' → ' + escapeHtml(target?.title || link.toEvent) + '</strong><span class="source-tier">' + Math.round(link.confidence*100) + '%</span></div><p>' + escapeHtml(link.evidence) + '</p>';
      list.append(card);
    });
    body.append(detailSection('Causal links', list));
  }

  openDrawer();
}

function openClaim(claim) {
  track('detail');
  $('drawerKicker').textContent = claim.kind + ' · ' + claim.status;
  $('drawerTitle').textContent = claim.text;
  const body = $('drawerBody');
  body.replaceChildren();

  const confidence = el('div', 'why-box', ('Confidence: ' + Math.round(claim.confidence * 100) + '%. ' + (claim.notes || '')).trim());
  body.append(detailSection('Epistemic status', confidence));

  const evidenceItems = evidenceForClaim(claim);
  const evidenceWrap = el('div');
  evidenceItems.forEach((item) => {
    const source = sourceForEvidence(item);
    const card = el('article', 'evidence-card');
    const head = el('div', 'evidence-card-head');
    head.append(el('strong', '', source?.publisher || item.sourceId), el('span', 'source-tier', item.sourceTier || source?.tier || 'source'));
    card.append(head, el('p', '', item.support));
    if (item.locator) card.append(el('p', 'notes', 'Locator: ' + item.locator));
    if (source?.url) {
      const link = el('a', '', 'Open source ↗');
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.addEventListener('click', () => track('evidence'));
      card.append(link);
    }
    evidenceWrap.append(card);
  });
  body.append(detailSection('Evidence (' + evidenceItems.length + ')', evidenceWrap));

  const relatedEvents = state.data.events.filter((event) => (claim.eventIds || []).includes(event.id));
  if (relatedEvents.length) {
    const list = el('div');
    relatedEvents.forEach((event) => {
      const chip = el('button', 'ghost-button', event.title);
      chip.type = 'button';
      chip.style.margin = '0 6px 6px 0';
      chip.addEventListener('click', () => openEvent(event));
      list.append(chip);
    });
    body.append(detailSection('Related events', list));
  }

  openDrawer();
}

function detailSection(title, content) {
  const section = el('section', 'detail-section');
  section.append(el('h3', '', title), content);
  return section;
}

function openDrawer() {
  $('drawerBackdrop').hidden = false;
  $('drawer').classList.add('is-open');
  $('drawer').setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeDrawer() {
  $('drawer').classList.remove('is-open');
  $('drawer').setAttribute('aria-hidden', 'true');
  $('drawerBackdrop').hidden = true;
  document.body.style.overflow = '';
}

function showPulse() {
  const totalTabs = Object.values(pulse.tabVisits).reduce((a,b) => a+b,0);
  const entries = [
    ['Sessions', pulse.sessions],
    ['First detail', pulse.firstDetailMs === null ? 'not yet' : (pulse.firstDetailMs/1000).toFixed(1) + 's'],
    ['Detail opens', pulse.detailOpens],
    ['Evidence opens', pulse.evidenceOpens],
    ['Filter changes', pulse.filterChanges],
    ['Tab visits', totalTabs],
  ];
  $('pulseBody').replaceChildren(...entries.map(([label, value]) => {
    const node = el('div'); node.append(el('strong', '', String(value)), el('span', '', label)); return node;
  }));
  $('pulseDialog').showModal();
}

function showFatal(err) {
  console.error(err);
  const main = document.querySelector('main');
  main.innerHTML = '<div class="error-state"><strong>Explorer could not load this pack.</strong><br>' + escapeHtml(err.message || String(err)) + '</div>';
}

function formatDate(value) {
  try { return new Intl.DateTimeFormat('en', { year:'numeric', month:'short', day:'numeric', timeZone:'UTC' }).format(new Date(value)); }
  catch { return value; }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#039;', '"':'&quot;' })[ch]);
}
function escapeAttr(value) { return escapeHtml(value); }

boot();
