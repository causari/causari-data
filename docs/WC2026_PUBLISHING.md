# WC2026 Publishing Protocol

This document defines the safe publishing workflow for the World Cup 2026 recap page at:

<https://causari.github.io/causari-data/wc2026/>

The repo is public and may receive updates from other contributors. Recap publishing must therefore be conflict-safe and evidence-driven.

## Files

- `wc2026/index.html` — static visual page
- `wc2026/data/recaps.json` — daily recap feed consumed by the page
- `.github/workflows/pages.yml` — GitHub Pages deployment workflow

## Safe update flow

1. Fetch latest `main` before editing.
2. Read `wc2026/data/recaps.json` from latest `main`.
3. Keep the current blob SHA of the JSON file.
4. Parse the existing JSON.
5. Insert or replace exactly one recap entry by `date`.
6. Preserve unrelated fields and other recap entries.
7. Deduplicate by `date`.
8. Sort `recaps` chronologically.
9. Update `lastUpdated`.
10. Update the file using the current blob SHA.
11. If GitHub rejects the update because the SHA is stale, refetch latest `main`, re-apply the minimal patch, and retry once.
12. If the second attempt conflicts, stop and report the conflict. Do not force overwrite.

## Evidence requirements

A publisher must not claim that the page was successfully published unless these checks pass:

- The commit SHA for the JSON update is known.
- `wc2026/data/recaps.json` exists on `main` after the update.
- The new match-day `date` is present in the JSON on `main`.
- GitHub Pages workflow or deploy evidence is checked when available.
- The public URL is verified as reachable when an HTTP/web check tool is available.

If any evidence is unavailable, say so explicitly.

## Response template

```text
Publish evidence
✅ JSON updated on main: <commit-sha>
✅ Recap date present: YYYY-MM-DD
✅ Pages workflow/deploy evidence: <status or unavailable>
✅ Public URL check: <200 OK or unavailable/failed>
```

## Failure handling

Still send the Vietnamese recap even if publishing fails. Add a short `Publish status` section explaining:

- what was updated
- what failed
- what evidence is missing
- whether manual action is needed
