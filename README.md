# causari-data

> Open causal knowledge graph for AI agents and humans.

**100+ curated events**, **130+ causal links** with evidence and confidence scores, **8 insight patterns** — focused on the history of computing and software engineering.

This dataset powers [@causari/mcp-server](https://github.com/causari/mcp-server), a Model Context Protocol server that gives Claude Code, Cursor, and any MCP-compatible agent structured causal knowledge.

## Data format

```
data/
├── events.json        # Historical events with metadata
├── links.json         # Causal relationships between events
└── insights.json      # Recurring causal patterns
```

### Event schema

```json
{
  "id": "kubernetes",
  "title": "Kubernetes",
  "description": "Google open-sourced its container orchestration system...",
  "yearNum": 2014,
  "yearLabel": "2014",
  "precision": "year",
  "domains": ["technology", "systems"],
  "impactScore": 0.82,
  "tags": ["containers", "orchestration", "kubernetes", "cloud"],
  "wikidataId": "Q22661306"
}
```

### Causal link schema

```json
{
  "id": "docker--caused-->kubernetes",
  "fromEvent": "docker",
  "toEvent": "kubernetes",
  "relationship": "caused",
  "confidence": 0.9,
  "evidence": "Kubernetes orchestrates Docker containers. Docker created the packaging format; K8s automated running them at scale."
}
```

### Insight schema

```json
{
  "id": "pattern--abstraction-layer-migration",
  "pattern": "Abstraction Layer Migration",
  "description": "Computing advances by adding abstraction layers that hide complexity...",
  "instances": ["fortran--enabled-->c_language", "..."],
  "predictiveValue": 0.82,
  "domains": ["technology"]
}
```

See [SCHEMA.md](SCHEMA.md) for full field definitions.

## Coverage

| Vertical | Events | Links | Patterns |
|----------|--------|-------|----------|
| Computing & Software Engineering | 50 | 81 | 3 |
| AI / Machine Learning | 15 | 15 | — |
| Civilizational history | 35 | 36 | 5 |
| **Total** | **100** | **132** | **8** |

## Relationship types

| Type | Meaning | Example |
|------|---------|---------|
| `caused` | A directly caused B | Printing press → Renaissance |
| `enabled` | A made B possible | TCP/IP → World Wide Web |
| `accelerated` | A sped up B | TypeScript → React adoption |
| `inspired` | A was conceptual seed for B | Unix → Linux |
| `delayed` | A slowed B | AI Winter → neural net research |
| `prevented` | A blocked B | (rare, used for counterfactuals) |

## Usage

### With the MCP server (recommended)

```json
{
  "mcpServers": {
    "causari": { "command": "npx", "args": ["-y", "@causari/mcp-server"] }
  }
}
```

### Direct import

```typescript
import events from '@causari/data/events.json';
import links from '@causari/data/links.json';
import insights from '@causari/data/insights.json';
```

### Raw JSON

Download from [releases](https://github.com/causari/causari-data/releases) or clone the repo.

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

**Quick version:**
1. Open an issue with the `proposed-event` or `proposed-link` label
2. Include: title, year, description, domains, and at least one source
3. For causal links: include evidence explaining *why* the causal relationship exists
4. A maintainer reviews and merges approved events in batches

Quality over quantity. Every event needs a clear description. Every link needs cited evidence. Confidence scores must be honest.

## License

**CC-BY-SA 4.0** — you can use, share, and adapt this data for any purpose (including commercial), as long as you give attribution and share derivatives under the same license.

See [LICENSE](LICENSE) for the full text.

## Links

- [@causari/mcp-server](https://github.com/causari/mcp-server) — MCP server for AI agents
- [Powflow Canvas](https://causari-demo.pages.dev) — visual explorer for humans
- [causari.ai](https://causari.ai) — project home
