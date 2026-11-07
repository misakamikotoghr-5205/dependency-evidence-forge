# Dependency Evidence for Jira

Freeze the dependency context you reviewed, then compare it with current evidence before acting. This is a read-only Forge issue panel and a complete offline CLI prototype for Codegeist 2026.

**Status:** the local engine, fictional workflows, official SDK handler, UI type check and bundles are verified. The app has **not** been registered, deployed, installed in Jira or submitted to Codegeist. No live Jira credentials were used. The manifest contains an explicit unregistered placeholder; a real judge installation link is still required. This project uses deterministic graph analysis, with no AI inference claim.

On 2026-11-07, a task-local official Forge CLI 15.0.0 was installed and checked
using an official, checksum-verified Node 24.22.1 runtime. After declining CLI
usage analytics, a bounded `forge whoami` check failed with an authentication
requirement and a credential-store error. No usable authenticated identity was
obtained; the supported credential environment variables were absent. This does
not establish that no historical keychain entry exists. No login, new token,
registration, deployment or installation was initiated. The complete sanitized
attempt sequence and setup limits are in the [check record](docs/evidence/authentication-20261107.json).

## Run the full local workflow

Node 24 is recommended (Node 22+ for the offline CLI).

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
node src/cli.js demo --out output/my-first-review
```

Open `output/my-first-review/report.html`. It is self-contained and makes no network requests. The demo creates frozen `baseline.json`, `current.json`, `comparison.json` and an HTML report. Output files/directories are never overwritten: choose a fresh path on subsequent runs.

The fictional baseline has two completed prerequisites. The current view reopens `OPS-3`, adds a cycle with `CORE-2`, changes the root summary and adds a dependency the caller cannot access (`SEC-4`). The report shows these separately and marks the old review for rechecking. Unknown data stays unknown.

Individual commands:

```sh
node src/cli.js snapshot --fixture fixtures/baseline.json --out output/review-a.json
node src/cli.js snapshot --fixture fixtures/current.json --out output/review-b.json
node src/cli.js compare --baseline output/review-a.json --current output/review-b.json --out output/recheck.html
node src/cli.js report --snapshot output/review-a.json --out output/baseline-report.html
```

The CLI uses supplied fixtures only and does not access Jira. Fixture timestamps are reproducible demonstration inputs, not live observations.

## What changes a review

- A status/category, summary, dependency link or even only an `updated` timestamp changes.
- An issue becomes inaccessible, disappears from the observed traversal, or becomes newly reachable.
- Pagination stalls, a bound is reached, evidence conflicts, or a response omits required fields.
- A dependency cycle exists, including self-dependency.

Blocking paths explain how each prerequisite is reached. Cycles are reported as strongly connected groups, not invented schedules. `done` means Jira's status category, not independently verified completion. All results require human review; the app never writes issues, transitions workflow, approves releases or stores shared snapshots.

The SHA256 digest detects accidental editing of the saved JSON. It is **not** a signature, trusted timestamp or proof of authorship: anyone can recreate a digest. Treat an imported baseline as the review record supplied by its holder.

## Real Forge adapter

The repository contains a `jira:issuePanel` native UI Kit module, official `@forge/react`/`@forge/bridge` UI, and `@forge/resolver` backend. The backend uses `api.asUser().requestJira` and the `route` tagged template. Only `read:jira-work` is declared. Enhanced JQL search uses HTTP POST **as a read query**; GET probes explain missing records. There are no Jira write routes, external model calls, app storage or scheduled jobs.

The user explicitly selects an actual link type ID and whether `inwardIssue` or `outwardIssue` is the prerequisite, checking the site's own descriptions. It does not guess dependencies from English names or turn every related link into a blocker. The resolver obtains site/root from its invocation context and always applies the current caller's Jira permissions.

To finish the real installation, the app owner must use the [official Forge setup](https://developer.atlassian.com/platform/forge/getting-started/), register the app to replace the placeholder ID, run the official lint/deploy/install workflow on their own development site, and follow [sharing instructions](https://developer.atlassian.com/platform/forge/distribute-your-apps/#start-sharing-your-app). This repository has not performed those authenticated steps. Jira issue panels also have an edit-permission visibility requirement documented by Atlassian, although this app itself reads only.

In the panel: select link type/direction → capture → copy JSON to a private review record or use it as baseline → recheck later. Current evidence and drift appear separately. Changing issue, site or dependency scope makes a baseline incomparable. The app does not keep the baseline on a server; reopening the panel requires pasting it again.

## Limits that affect interpretation

Collection follows only the configured links visible to the caller. It fetches at most 60 issue records, 6 dependency levels and 12 search pages, with 10-key query batches; up to 250 referenced placeholders are preserved. Hitting a bound is explicit. `403`, `404` (missing **or hidden**), `429`, incomplete search results and malformed fields cannot become `done`.

Jira search can be eventually consistent, and a multi-request capture is not atomic. Invisible links may not be disclosed by Jira at all. “Clear in visible scope” and “no observed drift” therefore cannot prove organizational completeness or authorize a release. Save reports privately: summaries can contain business information. No data is sent to third-party renderers or models.

## Validation and provenance

`npm run check` runs 19 meaningful local tests, the actual SDK UI type check, local frontend/backend bundles, a real SDK resolver rejection smoke test, manifest structure checks and a complete CLI demo. Results are written to ignored `output/verification.json`; it explicitly records zero live Jira requests and no official Forge deployment. This is not a replacement for a real installation test.

Sources, exact comparison commits and licenses are in [docs/landscape.md](docs/landscape.md). Jira graphing already exists; this prototype adds a frozen review/recheck workflow and explicit incomplete-evidence handling. The engine is independently implemented, with no code copied from the comparison projects. SDKs retain Atlassian's own terms, described in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

See [competition requirements](docs/competition.md), [data contract](docs/data-contract.md) and [demo script](docs/demo-script.md). Original project code is MIT, [LICENSE](LICENSE).
