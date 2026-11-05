# Third-party terms

Original application code is MIT. That does not relicense dependencies.

- `@forge/api` 8.4.0, `@forge/resolver` 2.0.2, `@forge/react` 12.4.0 and `@forge/bridge` 7.2.1 are official Atlassian packages. Their installed `LICENSE.txt` files were read; they grant use under the [Atlassian Developer Terms](https://developer.atlassian.com/platform/marketplace/atlassian-developer-terms/), rather than declaring MIT. They are installed through npm, not copied into this repository. Their notices/terms must remain with any redistribution.
- React 18.3.1, esbuild 0.25.12 and yaml 2.8.1 declare MIT; TypeScript 5.9.3 declares Apache-2.0. Transitive dependencies retain their own licenses and package notices. Exact dependency resolution is in `package-lock.json`.
- Compared projects `pawelrychlik/jira-dependency-graph` and `dagrejs/graphlib` are MIT at the pinned revisions in `docs/landscape-sources.json`. No code, tests or assets were copied, and neither is a runtime dependency.

`npm run check` compiles into memory for local verification; it does not publish a bundle containing third-party code. A subsequent Forge deployment remains subject to Atlassian platform/developer terms and the owner's account.
