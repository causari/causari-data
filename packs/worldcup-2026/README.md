# World Cup 2026 Event Pack

> A live-event causal timeline pack for the FIFA World Cup 2026.

This pack is a proof of concept for using Causari as a public communication layer for fast-moving events.

> ⚠️ **Data status — sourcing in progress.** The match results in this pack are **real**, but not every result yet carries an inline `sources` citation. Citations are being backfilled, and the daily live-update workflow ([../../docs/LIVE-UPDATES.md](../../docs/LIVE-UPDATES.md)) requires every new `completed` result to cite an official source. Until a result carries a `sources` entry, treat its citation as **pending verification**, not as unsourced opinion. The brand stakes its credibility on calibrated, sourced data.
>
> **Current contents:** 16 events (10 completed results + 6 `scheduled` upcoming fixtures), 9 causal links, 5 insight patterns. Validated by `scripts/validate-pack.mjs`.

Instead of only listing match results, it models how each result changes the tournament state:

```text
match result
→ group race implication
→ affected teams
→ momentum shift
→ next watchpoint
```

## Why this pack exists

The World Cup is a strong demo domain for causal timelines because it has:

- clear events with public outcomes
- strong causal links between results and standings
- visible momentum shifts
- emotionally legible actors such as teams, players, coaches, and fans
- a natural daily recap cadence
- easy public sharing as cards, timelines, or dashboards

## Files

```text
packs/worldcup-2026/
├── README.md
├── events.json
├── links.json
└── insights.json
```

## Scope

Initial scope:

- baseline group-stage results from the early tournament window
- upcoming fixtures modeled as `scheduled` events (the "watchpoints"), so completed results link forward to real nodes
- special focus on Argentina, Brazil, and Portugal
- causal links (event → event) that explain why specific results changed the tournament state
- reusable insight patterns attached to links via `instances`

Out of scope for this first pack:

- full official match database
- player-level statistics
- live score ingestion
- automated standings recomputation

## Intended users

### End users

A casual fan should be able to answer:

- What happened?
- Why did it matter?
- Which teams were affected?
- What should I watch next?

### Analysts and creators

A sports writer, newsletter author, or video creator should be able to turn the data into:

- daily recap
- shareable event map
- tournament command center
- narrative arcs by team

### AI agents

An AI agent should be able to retrieve structured context for:

- concise daily recaps
- pre-match briefings
- momentum summaries
- causal explanations of the bracket or group table

## Curation rules

1. Add only events that materially changed the tournament narrative.
2. Every causal link must explain why the relationship exists.
3. Prefer `enabled` and `accelerated` for probabilistic implications.
4. Use `caused` only for direct outcomes.
5. Keep confidence honest and conservative.

## Example

```text
Brazil 1-1 Morocco
→ accelerated Group C volatility
→ affected Brazil, Morocco, Scotland
→ created Brazil vs Scotland as a high-stakes watchpoint
```

This turns a scoreline into a causal communication unit.
