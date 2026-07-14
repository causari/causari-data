# Daily match-day agent — operating contract

This is the prompt/contract for the **scheduled agent** (Codex/ChatGPT) that updates the
`worldcup-2026` pack each day. Paste the "Prompt" section into the scheduled job. The guardrails
exist because this agent commits to a **public** repo that feeds a **public live visual** — a wrong
or unsourced scoreline is a public credibility failure.

> **The causal quality bar lives in [`docs/CAUSAL-CONTRACT.md`](./CAUSAL-CONTRACT.md).** Read it
> first — it explains why a mechanical "Scorers: …" feed makes the page *disprove* Causari, and
> defines exactly what a real `whyItMatters` / `nextWatchpoints` / typed-link set must contain.
> The prompt below now also runs `scripts/causal-quality.mjs`, the gate that FAILS templated data.
>
> **Connector evidence follows [`docs/SOURCE-ARTIFACT-CONTRACT.md`](./SOURCE-ARTIFACT-CONTRACT.md).**
> A truncated tool preview is routing context, not sufficient evidence for a public factual claim.

---

## Non-negotiable rules

1. **Real, sourced results only.** Never invent or recall a scoreline from memory. Pull each result
   from an authoritative source (FIFA match centre / a reputable results API) and include it in
   `sources`. If you cannot source a result, **do not add it**.
2. **Never push unvalidated data.** Always run `node scripts/add-match-day.mjs` — it validates the
   whole pack and refuses to write on any error. Then run `node scripts/validate-pack.mjs worldcup-2026`
   as a second check. If either fails, fix the input or stop — **do not commit a broken pack**.
3. **Edit only `packs/worldcup-2026/`** via the script. Do not touch the core dataset (`data/`),
   other packs, or unrelated files.
4. **Follow the graph model** (see `docs/PACKS.md`): links are event→event; upcoming matches are
   `status: "scheduled"` events; insights attach via `instances`; ids are single-hyphen kebab-case.
5. **Never silently trust truncation.** When evidence came through a connector, add explicit
   `capture.mode: "connector"` and `capture.truncated: true|false`. If truncated, retain a full
   checksummed artifact reference and read it (or independently verify the authoritative URL)
   before publishing. If the full evidence cannot be retrieved, skip the claim.

---

## Prompt (paste into the scheduled job)

```
You are the daily updater for the Causari "worldcup-2026" data pack in the causari/causari-data repo.

Each run, do exactly this:

1. Fetch yesterday's and today's FIFA World Cup 2026 fixtures and results from an authoritative
   source. For every COMPLETED match, capture: teams, score, group, date, and a citation URL.
   If you cannot verify a result against a real source, skip it — never guess a score.
   If a tool or connector returns a truncated preview, do not treat that preview as the full source:
   retrieve the full artifact or verify the claim directly at the authoritative URL first.

2. Build a match-day input file `scripts/match-day.json` following `scripts/match-day.example.json`:
   - "results": each completed match as an event. If a matching "scheduled" event id already exists
     in packs/worldcup-2026/events.json, reuse that id so the script flips it to completed. Put the
     score in the title, a 2-sentence causal description, a one-line "whyItMatters", the affected
     "entities", and a "sources" array with the citation (REQUIRED — the script rejects results
     without it). For connector-obtained evidence, include `capture` metadata that follows
     docs/SOURCE-ARTIFACT-CONTRACT.md; truncated captures require a full artifact URI, SHA-256,
     byte length, bounded preview, and retrieval hint.
   - "scheduled": the next fixtures these results set up, as upcoming events.
   - "links": event→event causal edges (completed result → the fixture/result it influenced), each
     with a real "evidence" sentence and a calibrated "confidence" (0.6–0.85 typical; reserve
     "caused" for direct outcomes, prefer "enabled"/"accelerated").
   - "insightInstances": attach new links to an existing pattern in insights.json when they fit, or
     add "newInsights" for a genuinely new recurring pattern.

3. Apply + validate:
       node scripts/add-match-day.mjs scripts/match-day.json
       node scripts/validate-pack.mjs worldcup-2026     # structure + source artifact safety
       node scripts/causal-quality.mjs worldcup-2026    # semantic causal gate
   If any command exits non-zero, fix the input and retry. Do NOT proceed on failure.
   (add-match-day.mjs already runs the causal-quality gate in memory before writing.)

4. Commit only if validation passed:
       git add packs/worldcup-2026
       git commit -m "data(worldcup): match-day update <YYYY-MM-DD>"
       git push
   Delete scripts/match-day.json after committing (it is a scratch input, not part of the pack).

Stay strictly within packs/worldcup-2026/. Quality and honesty over completeness: a smaller, correct,
sourced update beats a large speculative one.
```

---

## Why this is safe

- `add-match-day.mjs` validates the merged pack **in memory and writes nothing on error** — a bad
  input can't corrupt the pack on disk.
- The honesty gate (`sources` required for completed results) is enforced in code, not just prose.
- Connector evidence must declare whether it was truncated; truncated previews cannot pass without
  a retained, checksummed full-artifact reference.
- CI (`validate-packs`) re-checks on every push as a backstop, and the gated Pages deploy
  (`.github/workflows/pages.yml`) will **not republish** the live data if validation fails — so the
  public visual keeps serving the last-good pack even if a bad commit somehow lands.
