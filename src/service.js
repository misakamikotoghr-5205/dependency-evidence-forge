/** Pure resolver service permits real provider contract tests without a Jira login. */
import { analyze, canonical, collect, compare, InputError, scopeFor, validateSnapshot } from './evidence.js';

export function contextScope(context, payload) {
  // Never trust the browser to choose the site or root issue.
  const key = context?.extension?.issue?.key;
  const site = context?.cloudId;
  if (!site || !key) throw new InputError('Open the app from a Jira issue panel');
  return scopeFor(site, key, payload?.link_type_ids, payload?.direction);
}

export function createService(provider, { now = () => new Date().toISOString() } = {}) {
  return {
    async linkTypes() { return provider.linkTypes(); },
    async capture({ context, payload }) {
      const scope = contextScope(context, payload);
      const types = await provider.linkTypes();
      if (scope.link_type_ids.some(id => !types.some(type => type.id === id))) throw new InputError('Selected link type no longer exists');
      const snapshot = await collect(scope, provider, { capturedAt: now() });
      return { snapshot, report: analyze(snapshot) };
    },
    async recheck({ context, payload }) {
      if (typeof payload?.baseline !== 'string' || payload.baseline.length > 300000) throw new InputError('Paste a saved snapshot under 300 KB');
      let baseline;
      try { baseline = validateSnapshot(JSON.parse(payload.baseline)); }
      catch { throw new InputError('Snapshot is malformed or its digest does not match'); }
      const scope = contextScope(context, payload);
      if (canonical(scope) !== canonical(baseline.scope)) throw new InputError('Baseline belongs to a different site, issue or selected dependency scope');
      const types = await provider.linkTypes();
      if (scope.link_type_ids.some(id => !types.some(type => type.id === id))) throw new InputError('Selected link type no longer exists');
      const current = await collect(scope, provider, { capturedAt: now() });
      return { snapshot: current, comparison: compare(baseline, current) };
    }
  };
}
