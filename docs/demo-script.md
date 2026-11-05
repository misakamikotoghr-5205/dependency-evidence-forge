# Demonstration outline (target: under 3 minutes)

For a local prototype recording, label the entire view **fictional offline fixtures; not a live Jira installation**. A final Codegeist video must instead demonstrate the installed Forge app and provide its judge installation link.

1. **0:00–0:25 — Problem.** A release review used a dependency context yesterday. A status badge alone cannot say whether that context still holds.
2. **0:25–0:55 — Freeze.** Show `baseline.json`: root APP-1 depends on CORE-2 and OPS-3, both in Jira's done category. Point to explicit site, link type/direction, timestamp and digest. This is a review record, not release approval.
3. **0:55–1:40 — Recheck.** Run `node src/cli.js demo --out output/video-take-1`. Open the HTML. OPS-3 was reopened, CORE-2/OPS-3 form a cycle and SEC-4 is forbidden. Show the exact changed fields and unknown path. No inaccessible item became done.
4. **1:40–2:10 — Bounded evidence.** Explain pagination/limits and permission uncertainty. An unchanged timestamp or a Jira done category cannot establish actual delivery completeness.
5. **2:10–2:45 — Real adapter boundary.** Show the Forge panel source, read-only scope and `asUser` API adapter. If not installed, say so explicitly. Describe the remaining registration, installation, sharing link and video work without implying it happened.

Use only the provided fictional summaries in public recordings. Do not show account tokens or actual confidential Jira content. No AI inference is performed by this deterministic project.
