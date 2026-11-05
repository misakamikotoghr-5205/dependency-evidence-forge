/** Adapter boundary: the injected requester is always api.asUser().requestJira. */
import { InputError, issueKey } from './evidence.js';

const FIELDS = ['summary', 'status', 'updated', 'issuelinks'];

export function jiraProvider(request, route) {
  return {
    async search(keys, token) {
      keys.forEach(issueKey);
      const body = { jql: 'key in (' + keys.map(key => '"' + key + '"').join(',') + ') ORDER BY key ASC', fields: FIELDS, maxResults: 10 };
      if (token !== undefined) body.nextPageToken = token;
      const response = await request(route`/rest/api/3/search/jql`, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) throw new InputError('Jira search unavailable');
      return response.json();
    },
    async probe(key) {
      issueKey(key);
      const response = await request(route`/rest/api/3/issue/${key}?fields=${'id'}`, { method: 'GET', headers: { Accept: 'application/json' } });
      return response.status;
    },
    async linkTypes() {
      const response = await request(route`/rest/api/3/issueLinkType`, { method: 'GET', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new InputError('Cannot read link types; check app consent and Jira permissions');
      const body = await response.json();
      if (!Array.isArray(body.issueLinkTypes) || body.issueLinkTypes.length > 200) throw new InputError('Unexpected Jira link types');
      return body.issueLinkTypes.map(type => {
        if (typeof type.id !== 'string' || !/^\d{1,20}$/.test(type.id) || ['name', 'inward', 'outward'].some(field => typeof type[field] !== 'string' || type[field].length > 250)) throw new InputError('Malformed Jira link type');
        return { id: type.id, name: type.name, inward: type.inward, outward: type.outward };
      });
    }
  };
}
