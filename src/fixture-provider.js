/** Only reads supplied fictional Jira-shaped JSON; never performs a network call. */
import { InputError, issueKey } from './evidence.js';

export function fixtureProvider(data) {
  if (!data || !Array.isArray(data.issues) || data.issues.length > 250) throw new InputError('Fixture requires at most 250 issue responses');
  const byKey = new Map();
  for (const issue of data.issues) {
    issueKey(issue?.key);
    if (byKey.has(issue.key)) throw new InputError('Fixture contains duplicate issue keys');
    byKey.set(issue.key, structuredClone(issue));
  }
  const pageSize = data.page_size ?? 2;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new InputError('Invalid fixture page size');
  return {
    async search(keys, token) {
      const offset = token === undefined ? 0 : Number(token);
      if (!Number.isInteger(offset) || offset < 0) throw new InputError('Invalid fixture page token');
      const all = keys.filter(key => byKey.has(key)).sort().map(key => byKey.get(key));
      const issues = all.slice(offset, offset + pageSize);
      return { issues: structuredClone(issues), isLast: offset + pageSize >= all.length, ...(offset + pageSize < all.length ? { nextPageToken: String(offset + pageSize) } : {}) };
    },
    async probe(key) { return data.omitted_status?.[key] || (byKey.has(key) ? 200 : 404); }
  };
}
