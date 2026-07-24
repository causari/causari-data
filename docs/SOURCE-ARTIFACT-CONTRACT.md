# Source Artifact Safety Contract

Status: v1  
Scope: evidence obtained through tools/connectors before it becomes public Causari data.

## Problem

Connector and tool responses may be truncated to fit an agent context. A preview is useful for routing, but it is unsafe as the sole basis for a public factual claim because omitted rows or fields may change the conclusion.

Causari therefore distinguishes:

```text
direct, independently retrievable citation
vs.
connector capture with explicit completeness metadata
```

The pack remains deterministic. This contract does not add another agent loop; it only controls what evidence an updater may trust.

## Rules

1. A normal authoritative URL may remain a legacy source object with `type`, `citation`, and `url`.
2. Evidence obtained through a connector should include `capture.mode: "connector"`.
3. Connector evidence must state `truncated: true|false`. Missing means unknown and fails validation.
4. A truncated response must retain a full artifact with:
   - stable URI or content location;
   - SHA-256 checksum;
   - full payload byte length;
   - bounded preview;
   - retrieval instructions.
5. An agent must read the full artifact or independently verify the claim at the authoritative URL before publishing.
6. The artifact itself should not be copied into `events.json`; the pack stores only provenance metadata.
7. Secrets, access tokens, cookies, and private headers must never be retained in previews or artifacts.

## Source examples

### Direct source

```json
{
  "type": "official",
  "citation": "FIFA — World Cup 2026 match centre",
  "url": "https://www.fifa.com/..."
}
```

### Complete connector response

```json
{
  "type": "official",
  "citation": "FIFA — World Cup 2026 match centre",
  "url": "https://www.fifa.com/...",
  "capture": {
    "mode": "connector",
    "truncated": false,
    "capturedAt": "2026-07-15T01:05:00Z"
  }
}
```

### Truncated connector response with retained artifact

```json
{
  "type": "official",
  "citation": "FIFA — World Cup 2026 match centre",
  "url": "https://www.fifa.com/...",
  "capture": {
    "mode": "connector",
    "truncated": true,
    "capturedAt": "2026-07-15T01:05:00Z",
    "artifact": {
      "uri": "artifact://connector/fifa-2026-07-15.json",
      "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      "byteLength": 120345,
      "preview": "{\"matches\":[...]}",
      "retrievalHint": "Read the stored JSON artifact before verifying scoreline claims."
    }
  }
}
```

## Validation

`validate-pack.mjs` calls `validateSourceCapture` for every event source. Existing direct citations remain backward compatible. Only a source that opts into connector capture is subject to the new completeness rules.

Run:

```bash
node scripts/source-artifact.test.mjs
node scripts/validate-pack.mjs
```

This contract protects provenance completeness. It does not prove that a source is authoritative or that the causal interpretation is correct; the honesty and causal-quality gates still apply.
