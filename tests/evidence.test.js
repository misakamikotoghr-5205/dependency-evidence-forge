import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { analyze, collect, compare, scopeFor, sealSnapshot, validateSnapshot } from '../src/evidence.js';
import { fixtureProvider } from '../src/fixture-provider.js';
import { snapshotFixture } from '../src/cli.js';

const baselinePath = new URL('../fixtures/baseline.json', import.meta.url);
const currentPath = new URL('../fixtures/current.json', import.meta.url);
const fixture = async () => JSON.parse(await readFile(baselinePath));
const scope = data => scopeFor(data.site_id, data.root_key, data.link_type_ids, data.direction);
async function capture(data, limits) { return collect(scope(data), fixtureProvider(data), { source: 'offline-fixture', capturedAt: data.captured_at, limits }); }
function reseal(data) { const { digest, ...payload } = data; return sealSnapshot(payload); }

test('baseline has a clear visible prerequisite set but never automatic approval', async () => {
  const result = analyze(await snapshotFixture(baselinePath));
  assert.equal(result.status, 'clear_in_visible_scope');
  assert.equal(result.complete_in_visible_scope, true);
  assert.equal(result.automatic_approval, false);
  assert.equal(result.review_required, true);
});

test('reopened dependency, cycle, permissions and scope drift remain independently visible', async () => {
  const baseline = await snapshotFixture(baselinePath), current = await snapshotFixture(currentPath);
  const before = structuredClone(baseline), result = compare(baseline, current);
  assert.equal(result.verdict, 'requires_review');
  assert.deepEqual(result.current_report.cycles, [['CORE-2', 'OPS-3']]);
  assert.deepEqual(result.current_report.blockers[0].path, ['APP-1', 'OPS-3']);
  assert.equal(result.current_report.unknown[0].availability, 'forbidden');
  assert.ok(result.changes.find(item => item.key === 'OPS-3').fields.includes('status'));
  assert.deepEqual(baseline, before);
});

test('timestamp-only edits invalidate a reviewed snapshot', async () => {
  const data = await fixture(); const baseline = await capture(data);
  data.captured_at = '2026-11-05T11:00:00Z'; data.issues[1].fields.updated = '2026-11-05T10:00:00Z';
  const result = compare(baseline, await capture(data));
  assert.equal(result.verdict, 'requires_review');
  assert.deepEqual(result.changes[0].fields, ['updated']);
});

test('unchanged evidence does not imply sign-off and later snapshot may still be blocked', async () => {
  const baseline = await snapshotFixture(baselinePath);
  assert.equal(compare(baseline, baseline).verdict, 'no_observed_drift');
  assert.equal(compare(baseline, baseline).automatic_approval, false);
  const data = await fixture(); data.issues[1].fields.status.statusCategory.key = 'indeterminate';
  const blocked = await capture(data);
  assert.equal(compare(blocked, blocked).verdict, 'requires_review');
});

test('paginated search fetches later pages instead of marking omitted prerequisites done', async () => {
  const data = await fixture(); data.page_size = 1;
  const source = fixtureProvider(data); const calls = [];
  const provider = { ...source, search: async (keys, token) => { calls.push({ keys, token }); return source.search(keys, token); } };
  const snapshot = await collect(scope(data), provider, { capturedAt: data.captured_at, source: 'offline-fixture' });
  assert.equal(snapshot.issues.length, 3);
  assert.equal(calls.at(-1).token, '1');
  assert.equal(analyze(snapshot).complete_in_visible_scope, true);
});

test('stalled pagination is incomplete even when all observed records are done', async () => {
  const data = await fixture(); const underlying = fixtureProvider(data);
  const provider = { ...underlying, search: async keys => ({ ...(await underlying.search(keys)), isLast: false, nextPageToken: 'stalled' }) };
  const snapshot = await collect(scope(data), provider, { capturedAt: data.captured_at, source: 'offline-fixture' });
  assert.ok(snapshot.notices.some(note => note.includes('repeated')));
  assert.equal(analyze(snapshot).status, 'unknown');
});

test('node depth and page limits never convert uncollected prerequisites to completion', async () => {
  for (const limits of [{ maxNodes: 1 }, { maxPages: 1 }, { maxDepth: 1 }]) {
    const data = await fixture();
    if ('maxDepth' in limits) data.issues[1].fields.issuelinks = [{ id: 'deep', type: { id: '10000' }, inwardIssue: { key: 'DEEP-1' } }];
    const result = analyze(await capture(data, limits));
    assert.equal(result.status, 'unknown');
    assert.equal(result.complete_in_visible_scope, false);
    assert.ok(result.unknown.length);
  }
});

test('missing fields, 404, 429 and request failure are unknown with explicit reasons', async () => {
  for (const code of [403, 404, 429, 200]) {
    const data = await fixture(); data.issues.pop(); data.omitted_status = { 'OPS-3': code };
    const result = analyze(await capture(data));
    assert.equal(result.status, 'unknown');
    assert.equal(result.unknown[0].availability, ({ 403: 'forbidden', 404: 'not_found_or_hidden', 429: 'rate_limited' })[code] || 'not_returned');
  }
  const data = await fixture(); delete data.issues[1].fields.issuelinks;
  assert.equal(analyze(await capture(data)).unknown[0].availability, 'malformed');
});

test('self-cycle is detected and inward versus outward semantics are never guessed', async () => {
  const data = await fixture();
  data.issues[0].fields.issuelinks = [{ id: 'self', type: { id: '10000' }, inwardIssue: { key: 'APP-1' } }];
  assert.deepEqual(analyze(await capture(data)).cycles, [['APP-1']]);
  data.direction = 'outward';
  const result = analyze(await capture(data));
  assert.equal(result.reachable_count, 1); assert.equal(result.status, 'clear_in_visible_scope');
  assert.equal(result.scope.direction, 'outward');
});

test('modified checksum, duplicate records, wrong site or earlier evidence are rejected', async () => {
  const original = await snapshotFixture(baselinePath);
  const edited = structuredClone(original); edited.issues[0].summary = 'forged';
  assert.throws(() => validateSnapshot(edited), /digest mismatch/);
  edited.issues = [...original.issues, original.issues[0]];
  assert.throws(() => reseal(edited), /Duplicate/);
  const different = structuredClone(original); different.scope.site_id = 'other-site';
  assert.throws(() => compare(original, reseal(different)), /different site/);
  const old = structuredClone(original); old.captured_at = '2026-11-05T08:30:00Z';
  assert.throws(() => compare(original, reseal(old)), /predates/);
});

test('removing a dependency is reported as no longer observed rather than completion', async () => {
  const data = await fixture(), baseline = await capture(data);
  data.issues[0].fields.issuelinks.pop(); data.captured_at = '2026-11-05T10:00:00Z';
  const result = compare(baseline, await capture(data));
  assert.equal(result.verdict, 'requires_review');
  assert.deepEqual(result.changes.find(item => item.key === 'OPS-3').fields, ['no_longer_observed']);
});

test('conflicting duplicate pages and unexpected issues fail conservatively', async () => {
  const data = await fixture(); let calls = 0;
  const provider = { probe: async () => 404, search: async () => { calls++; const raw = structuredClone(data.issues[0]); if (calls > 1) raw.fields.summary = 'conflicting'; return { issues: [raw], isLast: calls > 1, nextPageToken: 'next' }; } };
  const result = analyze(await collect(scope(data), provider, { capturedAt: data.captured_at, source: 'offline-fixture' }));
  assert.equal(result.status, 'unknown');
  assert.ok(result.notices.some(note => note.includes('Conflicting')));
});
