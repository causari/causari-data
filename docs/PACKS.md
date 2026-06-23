# Event Packs

Causari event packs are optional, topic-specific causal datasets that sit beside the core long-horizon causal knowledge graph.

They are useful when a domain has a clear event stream, a focused audience, or a faster update cadence than the core dataset.

Examples:

- live tournaments and seasons
- product launches
- market cycles
- AI ecosystem timelines
- geopolitical or policy timelines
- company or technology histories

## Directory layout

```text
packs/{pack-id}/
├── README.md       # pack purpose, audience, curation notes
├── events.json     # CKGEvent-compatible events
├── links.json      # CausalLink-compatible relationships
└── insights.json   # recurring patterns found inside this pack
```

## Compatibility

Pack files should remain compatible with the existing Causari schemas:

- `events.json` follows `CKGEvent`
- `links.json` follows `CausalLink`
- `insights.json` follows `Insight`

For live or short-horizon timelines, packs may use the following optional event fields:

| Field | Type | Description |
|---|---|---|
| `date` | string | ISO date when the event happened or is scheduled |
| `dateLabel` | string | Human-readable date label |
| `status` | string | `completed`, `scheduled`, `live`, or `forecast` |
| `entities` | string[] | Teams, companies, people, or other actors affected by the event |
| `whyItMatters` | string | Short explanation of the event's causal importance |
| `nextWatchpoints` | string[] | Follow-up events or questions to monitor |

These optional fields let a pack model live event intelligence without changing the core schema.

## Graph modeling rules (required for clean loading)

A pack is a causal graph. To load cleanly into any Causari consumer (the visual explorer, the MCP store, an agent), it must follow the same structural rules as the core dataset:

- **Links connect events to events.** A `CausalLink`'s `fromEvent` and `toEvent` must both be `id`s of events **in the same pack**. Never point a link at an insight id or at a node that isn't defined — that produces dangling edges in the visual.
- **Insights attach to links, not the other way around.** An `Insight.instances` array lists the `CausalLink` ids that demonstrate the pattern. Insights are not graph nodes and are never link endpoints.
- **Upcoming fixtures are events with `status: "scheduled"`.** Model a "watchpoint" (a match that hasn't happened yet) as a real scheduled event, then link the completed result to it. This keeps `nextWatchpoints` (free-text hints) separate from the actual graph edges.
- **Ids are kebab-case and globally unique** (e.g. `wc2026-brazil-draws-morocco`). Avoid `--` inside an event id so the link id `{from}--{rel}-->{to}` stays unambiguous.

Run `node scripts/validate-pack.mjs <pack-id>` before every commit — it enforces all of the above (referential integrity, id format, enums, 0–1 ranges) and is wired into CI.

## Pack quality bar

A pack should be accepted when it has:

1. A clear audience and use case.
2. Events that are significant enough to change downstream interpretation.
3. Links with explicit causal reasoning, not just chronological adjacency.
4. Honest confidence scores.
5. Enough citations or source notes for later verification.

## Relationship guidance for live timelines

Use relationship types conservatively:

- `caused`: direct result, such as a match win causing qualification.
- `enabled`: opened a path or condition for a later event.
- `accelerated`: increased momentum or made an outcome more likely sooner.
- `inspired`: tactical, narrative, or conceptual influence.
- `delayed`: slowed progress toward an outcome.
- `prevented`: blocked a path or eliminated a possibility.

When in doubt, prefer `enabled` or `accelerated` over `caused`.

## Consuming a pack

There are two ways to load a pack, and the right one depends on update cadence.

### Live packs → fetch at runtime (recommended for daily-updated packs)

A pack like `worldcup-2026` changes every match-day. A **build-time `import`** would bundle a snapshot into the app, so every update would need a redeploy. Instead, **fetch the JSON at runtime from a CDN** so a `git push` to this repo is the only step needed to update the live visual:

```typescript
const BASE = 'https://raw.githubusercontent.com/causari/causari-data/main/packs/worldcup-2026';
// raw.githubusercontent.com is CORS-enabled and Fastly-cached (~5 min propagation).

const [events, links, insights] = await Promise.all([
  fetch(`${BASE}/events.json`).then((r) => r.json()),
  fetch(`${BASE}/links.json`).then((r) => r.json()),
  fetch(`${BASE}/insights.json`).then((r) => r.json()),
]);
```

For higher traffic, serve via jsDelivr and purge on each commit (see [LIVE-UPDATES.md](LIVE-UPDATES.md)):

```
https://cdn.jsdelivr.net/gh/causari/causari-data@main/packs/worldcup-2026/events.json
```

### Static packs → build-time import

For a pack that rarely changes, a bundled import is fine:

```typescript
import events from '@causari/data/packs/worldcup-2026/events.json';
```

A visual explorer can then render:

```text
Event → causal link → affected entity → next watchpoint
```

See [LIVE-UPDATES.md](LIVE-UPDATES.md) for the daily match-day update workflow.
