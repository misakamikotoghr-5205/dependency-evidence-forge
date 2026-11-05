import { makeResolver } from '@forge/resolver';
import api, { route } from '@forge/api';
import { jiraProvider } from './jira-provider.js';
import { createService } from './service.js';
import { InputError } from './evidence.js';

const provider = jiraProvider((path, options) => api.asUser().requestJira(path, options), route);
const service = createService(provider);
const handlers = {};
for (const operation of ['linkTypes', 'capture', 'recheck']) {
  handlers[operation] = async request => {
    try { return { ok: true, data: await service[operation](request) }; }
    catch (error) { return { ok: false, error: error instanceof InputError ? error.message : 'Jira evidence unavailable. Check app consent, Jira access and platform limits; no issue was changed.' }; }
  };
}
export const handler = makeResolver(handlers);
