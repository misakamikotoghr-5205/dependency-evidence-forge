/** Read-only dependency evidence; unknown is never interpreted as completion. */
import { createHash } from 'node:crypto';

export class InputError extends Error {}
const KEY = /^[A-Z][A-Z0-9_]{0,49}-[1-9][0-9]{0,12}$/;
const AVAILABILITY = new Set(['available', 'forbidden', 'not_found_or_hidden', 'rate_limited', 'unavailable', 'not_returned', 'limit', 'malformed']);
export const LIMITS = Object.freeze({ maxNodes: 60, maxDepth: 6, maxPages: 12, batchSize: 10 });

export function issueKey(value) {
  if (typeof value !== 'string' || !KEY.test(value)) throw new InputError('Expected a Jira issue key such as APP-12');
  return value;
}
export function instant(value) {
  if (typeof value !== 'string' || !/T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new InputError('Timestamp must be an ISO instant with a timezone');
  return new Date(value).toISOString();
}
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  const result = JSON.stringify(value);
  if (result === undefined || (typeof value === 'number' && !Number.isFinite(value))) throw new InputError('Unsupported JSON value');
  return result;
}
function digest(value) { return createHash('sha256').update(canonical(value)).digest('hex'); }
function exact(object, fields, name) {
  if (!object || Array.isArray(object) || typeof object !== 'object' || Object.keys(object).sort().join('|') !== [...fields].sort().join('|')) throw new InputError('Invalid ' + name + ' fields');
}
function string(value, max = 1000) { if (typeof value !== 'string' || !value.length || value.length > max) throw new InputError('Invalid text field'); return value; }

export function scopeFor(siteId, rootKey, linkTypeIds, direction = 'inward') {
  string(siteId, 150); issueKey(rootKey);
  if (!Array.isArray(linkTypeIds) || !linkTypeIds.length || linkTypeIds.length > 10 || linkTypeIds.some(id => typeof id !== 'string' || !/^\d{1,20}$/.test(id)) || new Set(linkTypeIds).size !== linkTypeIds.length) throw new InputError('Select 1–10 explicit Jira link type IDs');
  if (!['inward', 'outward'].includes(direction)) throw new InputError('Select inward or outward dependency direction');
  return { site_id: siteId, root_key: rootKey, link_type_ids: [...linkTypeIds].sort(), direction };
}

export function normalizeIssue(raw, scope) {
  issueKey(raw?.key);
  const fields = raw.fields;
  if (!fields || typeof fields.summary !== 'string' || fields.summary.length > 4000 || !Array.isArray(fields.issuelinks) || fields.issuelinks.length > 100 || typeof fields.status?.id !== 'string' || typeof fields.status?.name !== 'string' || !['new', 'indeterminate', 'done'].includes(fields.status?.statusCategory?.key)) throw new InputError('Jira response omitted required evidence fields');
  const dependencies = [];
  for (const link of fields.issuelinks) {
    if (!link || typeof link.type?.id !== 'string') throw new InputError('Malformed issue link');
    if (!scope.link_type_ids.includes(link.type.id)) continue;
    const target = link[scope.direction + 'Issue'];
    if (!target) continue;
    issueKey(target.key); string(link.id, 100);
    dependencies.push({ key: target.key, link_id: link.id, type_id: link.type.id });
  }
  dependencies.sort((a, b) => a.key.localeCompare(b.key) || a.link_id.localeCompare(b.link_id));
  return { key: raw.key, availability: 'available', summary: fields.summary,
    status: { id: fields.status.id, name: fields.status.name, category: fields.status.statusCategory.key },
    updated: instant(fields.updated), dependencies };
}

export function sealSnapshot(payload) {
  const snapshot = structuredClone(payload);
  return validateSnapshot({ ...snapshot, digest: digest(snapshot) });
}
export function validateSnapshot(value) {
  if (!value || typeof value !== 'object' || canonical(value).length > 300000) throw new InputError('Snapshot exceeds 300 KB or is not an object');
  exact(value, ['schema_version', 'scope', 'captured_at', 'source', 'limits', 'notices', 'issues', 'digest'], 'snapshot');
  if (value.schema_version !== 1) throw new InputError('Unsupported snapshot version');
  exact(value.scope, ['site_id', 'root_key', 'link_type_ids', 'direction'], 'scope');
  const scope = scopeFor(value.scope.site_id, value.scope.root_key, value.scope.link_type_ids, value.scope.direction);
  if (canonical(scope) !== canonical(value.scope)) throw new InputError('Scope is not normalized');
  instant(value.captured_at);
  if (!['offline-fixture', 'jira-as-user'].includes(value.source)) throw new InputError('Invalid evidence source');
  exact(value.limits, Object.keys(LIMITS), 'limits');
  for (const [key, maximum] of Object.entries(LIMITS)) if (!Number.isInteger(value.limits[key]) || value.limits[key] < 1 || value.limits[key] > maximum) throw new InputError('Invalid collection limits');
  if (!Array.isArray(value.notices) || value.notices.length > 300 || value.notices.some(note => typeof note !== 'string' || note.length > 250)) throw new InputError('Invalid collection notices');
  if (!Array.isArray(value.issues) || !value.issues.length || value.issues.length > 250) throw new InputError('Snapshot must include 1–250 issue records');
  const seen = new Set(); let edgeCount = 0;
  for (const issue of value.issues) {
    issueKey(issue?.key);
    if (seen.has(issue.key) || !AVAILABILITY.has(issue.availability)) throw new InputError('Duplicate issue or invalid availability');
    seen.add(issue.key);
    if (issue.availability !== 'available') { exact(issue, ['key', 'availability'], 'unknown issue'); continue; }
    exact(issue, ['key', 'availability', 'summary', 'status', 'updated', 'dependencies'], 'available issue');
    if (typeof issue.summary !== 'string' || issue.summary.length > 4000) throw new InputError('Invalid summary');
    exact(issue.status, ['id', 'name', 'category'], 'status'); string(issue.status.id, 100); string(issue.status.name, 250);
    if (!['new', 'indeterminate', 'done'].includes(issue.status.category)) throw new InputError('Unknown status category');
    instant(issue.updated);
    if (Date.parse(issue.updated) > Date.parse(value.captured_at)) throw new InputError('Issue update is later than collection time; collect again');
    if (!Array.isArray(issue.dependencies) || issue.dependencies.length > 100) throw new InputError('Too many dependency links');
    const links = new Set();
    for (const edge of issue.dependencies) {
      exact(edge, ['key', 'link_id', 'type_id'], 'dependency'); issueKey(edge.key); string(edge.link_id, 100);
      if (!scope.link_type_ids.includes(edge.type_id) || links.has(edge.link_id)) throw new InputError('Unexpected link type or duplicate link ID');
      links.add(edge.link_id);
    }
    edgeCount += issue.dependencies.length;
  }
  if (!seen.has(scope.root_key) || edgeCount > 1500) throw new InputError('Missing root or too many edges');
  const { digest: claimed, ...payload } = value;
  if (typeof claimed !== 'string' || !/^[a-f0-9]{64}$/.test(claimed) || claimed !== digest(payload)) throw new InputError('Snapshot digest mismatch; original evidence was changed');
  return structuredClone(value);
}

/** Provider requests are read-only; enhanced JQL search uses POST for queries. */
export async function collect(scope, provider, { capturedAt, source = 'jira-as-user', limits = LIMITS } = {}) {
  scope = scopeFor(scope.site_id, scope.root_key, scope.link_type_ids, scope.direction);
  const bounded = { ...LIMITS, ...limits };
  for (const [key, max] of Object.entries(LIMITS)) if (!Number.isInteger(bounded[key]) || bounded[key] < 1 || bounded[key] > max) throw new InputError('Collection limits may only be lowered');
  const queue = [{ key: scope.root_key, depth: 0 }], queued = new Set([scope.root_key]), issues = new Map(), notices = [];
  let pages = 0;
  while (queue.length) {
    const batch = queue.splice(0, bounded.batchSize);
    const eligible = [];
    for (const item of batch) {
      if (issues.size + eligible.length >= bounded.maxNodes || item.depth > bounded.maxDepth || pages >= bounded.maxPages) {
        issues.set(item.key, { key: item.key, availability: 'limit' });
        notices.push('Collection bound reached at ' + item.key); continue;
      }
      eligible.push(item);
    }
    if (!eligible.length) continue;
    const requested = new Set(eligible.map(item => item.key)), returned = new Map(), tokens = new Set();
    let token;
    while (true) {
      if (pages >= bounded.maxPages) { notices.push('Pagination limit reached'); break; }
      let page;
      try { pages++; page = await provider.search([...requested], token); }
      catch { notices.push('Search request failed; unresolved issues remain unknown'); break; }
      if (!page || !Array.isArray(page.issues) || page.issues.length > 100 || typeof page.isLast !== 'boolean') { notices.push('Malformed search page'); break; }
      for (const raw of page.issues) {
        if (!requested.has(raw?.key)) { notices.push('Search returned an unrequested issue; ignored'); continue; }
        if (returned.has(raw.key) && canonical(returned.get(raw.key)) !== canonical(raw)) { returned.set(raw.key, null); notices.push('Conflicting paged evidence for ' + raw.key); }
        else if (!returned.has(raw.key)) returned.set(raw.key, raw);
      }
      if (page.isLast) break;
      if (typeof page.nextPageToken !== 'string' || !page.nextPageToken.length || page.nextPageToken.length > 4000 || tokens.has(page.nextPageToken)) { notices.push('Pagination token missing or repeated'); break; }
      token = page.nextPageToken; tokens.add(token);
    }
    for (const item of eligible) {
      let issue;
      if (returned.has(item.key)) {
        try { issue = normalizeIssue(returned.get(item.key), scope); }
        catch { issue = { key: item.key, availability: 'malformed' }; }
      } else {
        let availability = 'not_returned';
        // Probe only to explain omissions; never promote omitted search evidence
        // to completion, even if a later GET happens to become visible.
        try {
          const status = await provider.probe(item.key);
          availability = ({ 403: 'forbidden', 404: 'not_found_or_hidden', 429: 'rate_limited' })[status] || 'not_returned';
        } catch { availability = 'unavailable'; }
        issue = { key: item.key, availability };
      }
      issues.set(item.key, issue);
      for (const edge of issue.dependencies || []) if (!queued.has(edge.key)) {
        queued.add(edge.key);
        if (queued.size > 250) { notices.push('Referenced node limit reached; unresolved edges retained'); continue; }
        queue.push({ key: edge.key, depth: item.depth + 1 });
      }
    }
  }
  return sealSnapshot({ schema_version: 1, scope, captured_at: instant(capturedAt || new Date().toISOString()), source,
    limits: bounded, notices: [...new Set(notices)].sort(), issues: [...issues.values()].sort((a, b) => a.key.localeCompare(b.key)) });
}

export function analyze(snapshot) {
  const data = validateSnapshot(snapshot), byKey = new Map(data.issues.map(issue => [issue.key, issue]));
  const paths = new Map([[data.scope.root_key, [data.scope.root_key]]]), queue = [data.scope.root_key];
  while (queue.length) {
    const key = queue.shift();
    for (const edge of byKey.get(key)?.dependencies || []) if (!paths.has(edge.key)) { paths.set(edge.key, [...paths.get(key), edge.key]); queue.push(edge.key); }
  }
  const unknown = [], blockers = [];
  for (const [key, path] of paths) {
    const issue = byKey.get(key);
    if (!issue || issue.availability !== 'available') unknown.push({ key, availability: issue?.availability || 'uncollected', path });
    else if (key !== data.scope.root_key && issue.status.category !== 'done') blockers.push({ key, status: issue.status.name, path });
  }
  // Tarjan SCCs explain cycles once, including self-dependencies.
  const indices = new Map(), low = new Map(), active = new Set(), stack = [], cycles = []; let next = 0;
  function visit(key) {
    indices.set(key, next); low.set(key, next++); stack.push(key); active.add(key);
    for (const edge of byKey.get(key)?.dependencies || []) {
      if (!indices.has(edge.key)) { visit(edge.key); low.set(key, Math.min(low.get(key), low.get(edge.key))); }
      else if (active.has(edge.key)) low.set(key, Math.min(low.get(key), indices.get(edge.key)));
    }
    if (low.get(key) === indices.get(key)) {
      const component = []; let member;
      do { member = stack.pop(); active.delete(member); component.push(member); } while (member !== key);
      if (component.length > 1 || byKey.get(key)?.dependencies?.some(edge => edge.key === key)) cycles.push(component.sort());
    }
  }
  visit(data.scope.root_key);
  const complete = unknown.length === 0 && data.notices.length === 0;
  return { status: blockers.length || cycles.length ? 'blocked' : !complete ? 'unknown' : 'clear_in_visible_scope',
    review_required: true, automatic_approval: false, complete_in_visible_scope: complete,
    blockers, unknown, cycles: cycles.sort((a, b) => a.join().localeCompare(b.join())), reachable_count: paths.size,
    notices: data.notices, scope: data.scope, captured_at: data.captured_at,
    caveat: 'Only selected link types/direction and issues visible to this caller. Search may be eventually consistent. Collection is not atomic; this is evidence for human review, never release approval.' };
}

export function compare(baseline, current) {
  baseline = validateSnapshot(baseline); current = validateSnapshot(current);
  if (canonical(baseline.scope) !== canonical(current.scope)) throw new InputError('Snapshots have different site, root or dependency scope; they cannot be compared');
  if (Date.parse(current.captured_at) < Date.parse(baseline.captured_at)) throw new InputError('Current evidence predates the baseline');
  const before = new Map(baseline.issues.map(issue => [issue.key, issue])), after = new Map(current.issues.map(issue => [issue.key, issue]));
  const changes = [];
  for (const key of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const old = before.get(key), fresh = after.get(key);
    if (!old || !fresh) { changes.push({ key, fields: [!old ? 'newly_reachable' : 'no_longer_observed'], prior: old?.availability || null, current: fresh?.availability || null }); continue; }
    const changed = ['availability', 'summary', 'status', 'updated', 'dependencies'].filter(field => canonical(old[field] ?? null) !== canonical(fresh[field] ?? null));
    if (changed.length) changes.push({ key, fields: changed, prior: old, current: fresh });
  }
  const report = analyze(current);
  return { verdict: changes.length || !report.complete_in_visible_scope || report.status === 'blocked' || baseline.notices.length || analyze(baseline).unknown.length ? 'requires_review' : 'no_observed_drift',
    baseline_digest: baseline.digest, current_digest: current.digest, baseline_at: baseline.captured_at, current_at: current.captured_at,
    changes, current_report: report, automatic_approval: false,
    note: 'Unchanged evidence is not a sign-off. An updated timestamp alone invalidates the old review; removals are observations, not proof of completion.' };
}
