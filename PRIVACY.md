# Privacy Policy — Dependency Evidence for Jira

Last updated: 2026-11-11

Dependency Evidence for Jira is a read-only Atlassian Forge issue panel (`read:jira-work`).

## Data Handling

- **No external transmission:** The app executes within Atlassian Forge (`nodejs24.x` runtime) and does not transmit Jira issue content, user identifiers, or telemetry to any external server, third-party API, or language model.
- **No persistent storage:** The app does not use Forge Storage, SQL, or external databases, and stores **no personal data**. Snapshot baselines exist only in the active browser session or when explicitly copied by the user.
- **Caller permissions:** All Jira read requests (`api.asUser().requestJira`) run strictly under the invoking Jira user's permissions.

## Contact

For questions or issue reports, open an issue at:
https://github.com/misakamikotoghr-5205/dependency-evidence-forge/issues
