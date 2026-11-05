# Evidence contract

Schema 1 stores scope, capture time, source (`offline-fixture` or `jira-as-user`), collection limits/notices, issue records and a SHA256 digest over canonical JSON excluding `digest`.

Scope is `{site_id, root_key, link_type_ids, direction}`. Explicit site-specific link IDs avoid assumptions about translated/custom link names. The prerequisite endpoint must be selected as `inward` or `outward`; it is not inferred from the issue's status or English description. Scopes must match for comparisons.

Available issue records contain `key`, `availability`, `summary`, `status: {id,name,category}`, `updated`, and `dependencies: [{key,link_id,type_id}]`. The only completed category is exactly `done`. Unknown categories or absent fields become malformed evidence, never an empty/completed dependency set. Unknown records contain only key and availability, preventing a hidden issue's embedded link summary from being used as if its full record had been authorized and checked.

The collector follows paginated enhanced JQL search via `nextPageToken`/`isLast`. It rejects repeated/missing continuation tokens and conflicting duplicates. An omitted issue is probed only to distinguish forbidden, missing-or-hidden or rate-limited cases. A later successful probe does not promote omitted search data into an available record. Search failures, truncation and field omissions remain explicit.

Bounded traversal: maximum 60 fetched/attempted records, depth 6, 12 search pages, batch 10; up to 250 referenced placeholders. Additional unresolved edges remain visible as unknown. Snapshot parsing limits 300 KB, 250 records and 1500 edges. No attempt is made to enumerate inaccessible Jira projects or hidden links.

Analysis returns `blocked`, `unknown` or `clear_in_visible_scope`; every result has `review_required:true` and `automatic_approval:false`. A known blocker/cycle may coexist with unknown records. Cycles are strongly connected groups; paths to blockers/unknowns are shortest observed paths from the root.

Recheck compares availability, summary, status, updated instant and selected dependency edges. New reachability or disappearance is a change, not a completion event. Timestamp-only changes require re-review. Different scope or a current snapshot older than the baseline is rejected. Identical but blocked/incomplete data still requires review; only complete unchanged evidence gets `no_observed_drift`, which is not approval.

Snapshots are user-held records. SHA256 detects edits only, not signatures, tamper resistance against an editor, trusted time or current permissions of an old record. The app does not persist shared snapshots. Exported JSON/HTML retains summaries; users control its privacy. Real captures use server time and current caller permissions but are not atomic, and search may be eventually consistent.
