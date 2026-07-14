# Live Updates — daily match-day workflow

How to keep a live pack (e.g. `worldcup-2026`) fresh so the public Powflow visual updates each day. The visual **fetches the pack JSON at runtime from a CDN**, so a `git push` to `main` is the only deploy step — no app rebuild.

---

## Serving model

The visual reads the pack directly from this repo over a CDN:

| Source | URL (events.json shown) | Cache / propagation | Use when |
|--------|-----|---------------------|----------|
| **GitHub Pages** (recommended — gated) | `https://causari.github.io/causari-data/packs/worldcup-2026/events.json` | Fastly, ~min; **only republished when validation passes** (see `.github/workflows/pages.yml`) | Default — a broken commit never reaches the live URL |
| **raw.githubusercontent** | `https://raw.githubusercontent.com/causari/causari-data/main/packs/worldcup-2026/events.json` | Fastly, ~5 min, CORS-enabled | Simple, but serves whatever is on `main` immediately (no deploy gate) |
| **jsDelivr** (scale) | `https://cdn.jsdelivr.net/gh/causari/causari-data@main/packs/worldcup-2026/events.json` | ~12 h on `@main` unless purged | Higher traffic; pair with a purge step (below) |

**Why GitHub Pages is the default:** the `pages` workflow runs the validator first and **skips the deploy if it fails**, so a bad daily commit can't publish a broken graph to the live visual — the page keeps serving the last-good pack. (raw/jsDelivr serve `main` directly with no such gate.)

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

Use the helper script — it does the mechanical wiring, enforces the honesty rule, and **validates the
whole pack in memory, writing nothing if anything is broken**. The scheduled agent uses the same flow
(see [DAILY-AGENT-PROMPT.md](DAILY-AGENT-PROMPT.md)).

1. **Write the day's input** — copy [`scripts/match-day.example.json`](../scripts/match-day.example.json)
   to `scripts/match-day.json` and fill in the day's **real, sourced** results, next fixtures, and links.
   Every completed result needs a `sources` citation (the script rejects results without one). If the
   citation was obtained through a connector, follow [SOURCE-ARTIFACT-CONTRACT.md](SOURCE-ARTIFACT-CONTRACT.md):
   declare truncation explicitly and retain a checksummed full artifact when a response was truncated.
2. **Apply + validate** (writes only if clean):
   ```bash
   node scripts/add-match-day.mjs scripts/match-day.json
   node scripts/source-artifact.test.mjs
   node scripts/validate-pack.mjs worldcup-2026
   ```
   If either exits non-zero, fix the input and retry — never commit a broken pack.
3. **Commit + push** to `main` (CI re-validates; the gated Pages deploy republishes only if green):
   ```bash
   git add packs/worldcup-2026
   git commit -m "data(worldcup): match-day update YYYY-MM-DD"
   git push
   rm scripts/match-day.json   # scratch input, not part of the pack
   ```
4. If serving via jsDelivr, run the purge snippet. GitHub Pages / raw.githubusercontent refresh within minutes.

> Prefer hand-editing the JSON directly? You can — just run step 2's validator before committing. The
> script is the safer default because it can't leave the pack in a broken state.

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

A connector preview is not automatically the full source. When `capture.mode` is `connector`,
`capture.truncated` must be explicit. A truncated capture is valid only when the complete payload is
retained behind a checksummed artifact reference and the updater reads that artifact (or verifies the
authoritative URL) before publishing.

---

## Graph rules recap (see docs/PACKS.md)

- Links are **event → event** only; never point a link at an insight or an undefined node.
- Upcoming matches are `status: "scheduled"` **events**, not free-text.
- Insights attach to links via `instances`.
- Ids are kebab-case, globally unique, no `--` inside an event id.
