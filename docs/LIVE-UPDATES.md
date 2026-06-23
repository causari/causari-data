# Live Updates — daily match-day workflow

How to keep a live pack (e.g. `worldcup-2026`) fresh so the public Powflow visual updates each day. The visual **fetches the pack JSON at runtime from a CDN**, so a `git push` to `main` is the only deploy step — no app rebuild.

---

## Serving model

The visual reads the pack directly from this repo over a CDN:

| Source | URL | Cache / propagation | Use when |
|--------|-----|---------------------|----------|
| **raw.githubusercontent** (default) | `https://raw.githubusercontent.com/causari/causari-data/main/packs/worldcup-2026/events.json` | Fastly, ~5 min, CORS-enabled | Default — simplest, fast enough for a daily tracker |
| **jsDelivr** (scale) | `https://cdn.jsdelivr.net/gh/causari/causari-data@main/packs/worldcup-2026/events.json` | ~12 h on `@main` unless purged | Higher traffic; pair with a purge step (below) |

The Powflow frontend fetches `events.json`, `links.json`, `insights.json` from one of the bases above and merges them for display. Do **not** bundle the JSON at build time — that would require a redeploy per update.

### jsDelivr purge (only if using jsDelivr)
After pushing an update, force the CDN to refresh:
```bash
for f in events links insights; do
  curl -s "https://purge.jsdelivr.net/gh/causari/causari-data@main/packs/worldcup-2026/$f.json" >/dev/null
done
```

---

## Status lifecycle of an event

Each fixture moves through `status` as the tournament progresses:

```
scheduled  → (kickoff) → live → (full time) → completed
```

- `scheduled` — fixture exists as a node, no result yet. Modeled now as a forward target for `nextWatchpoints`.
- `live` — optional, while the match is in progress.
- `completed` — final result known; fill in the scoreline in `title`/`description`, add a `sources` citation.

---

## Adding a match-day (the 5-minute loop)

1. **Edit the JSON** in `packs/worldcup-2026/`:
   - Flip the day's `scheduled` fixtures to `completed`; put the result in `title` + `description`; set `whyItMatters`.
   - Add the **next** fixtures as new `scheduled` events (so there's always a forward node to link to).
   - Add `links.json` edges **event → event** (completed result → the fixture/result it set up). Every link needs `evidence` + a calibrated `confidence`.
   - Update `insights[].instances` if a new link demonstrates an existing pattern, or add a new pattern.
   - Add a `sources` entry to every `completed` result (official source). See the honesty rule below.
2. **Validate** — never push a pack that fails:
   ```bash
   node scripts/validate-pack.mjs worldcup-2026
   ```
   Fix every error (dangling endpoints, bad ids, out-of-range numbers) before committing.
3. **Commit + push** to `main`:
   ```bash
   git add packs/worldcup-2026
   git commit -m "data(worldcup): match-day update YYYY-MM-DD"
   git push
   ```
4. If serving via jsDelivr, run the purge snippet. raw.githubusercontent refreshes itself within ~5 min.

CI runs `validate-pack.mjs` on every push/PR, so a broken pack is caught before it reaches the live visual.

---

## Honesty rule (non-negotiable for a public dataset)

A `completed` result is a factual claim. Every one must carry a source, e.g.:

```json
"sources": [
  { "type": "official", "citation": "FIFA — World Cup 2026 match centre", "url": "https://www.fifa.com/..." }
]
```

Until a result is sourced, keep the pack README's "illustrative / proof-of-concept" banner. Calibrated, sourced data is the whole brand promise — do not publish invented scorelines as fact.

---

## Graph rules recap (see docs/PACKS.md)

- Links are **event → event** only; never point a link at an insight or an undefined node.
- Upcoming matches are `status: "scheduled"` **events**, not free-text.
- Insights attach to links via `instances`.
- Ids are kebab-case, globally unique, no `--` inside an event id.
