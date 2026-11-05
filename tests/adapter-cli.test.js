import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { jiraProvider } from '../src/jira-provider.js';
import { createService, contextScope } from '../src/service.js';
import { analyze, collect, compare, sealSnapshot } from '../src/evidence.js';
import { fixtureProvider } from '../src/fixture-provider.js';
import { snapshotFixture } from '../src/cli.js';
import { renderReport } from '../src/report.js';

const fixturePath = new URL('../fixtures/baseline.json', import.meta.url);
const context = { cloudId: 'fictional-demo-site', extension: { issue: { key: 'APP-1' } } };
const payload = { link_type_ids: ['10000'], direction: 'inward' };
const tag = (parts, ...values) => parts.reduce((out, part, index) => out + part + (index < values.length ? encodeURIComponent(values[index]) : ''), '');

test('Jira adapter uses enhanced POST search and carries pagination without write operations', async () => {
  const calls = [];
  const provider = jiraProvider(async (path, options) => { calls.push({ path, options }); return { ok: true, status: 200, json: async () => ({ issues: [], isLast: true }) }; }, tag);
  await provider.search(['APP-1', 'OPS-3'], 'page-two-token'); await provider.probe('OPS-3');
  assert.equal(calls[0].path, '/rest/api/3/search/jql');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.nextPageToken, 'page-two-token');
  assert.equal(body.jql, 'key in ("APP-1","OPS-3") ORDER BY key ASC');
  assert.deepEqual(body.fields, ['summary', 'status', 'updated', 'issuelinks']);
  assert.equal(calls[1].options.method, 'GET');
  await assert.rejects(provider.search(['APP-1") OR project=SECRET'], undefined), /issue key/);
  assert.equal(calls.length, 2);
});

test('Jira link-type endpoint validates actual IDs and descriptions', async () => {
  const provider = jiraProvider(async () => ({ ok: true, json: async () => ({ issueLinkTypes: [{ id: '10000', name: 'Blocks', inward: 'is blocked by', outward: 'blocks' }] }) }), tag);
  assert.equal((await provider.linkTypes())[0].id, '10000');
  const broken = jiraProvider(async () => ({ ok: true, json: async () => ({ issueLinkTypes: [{ id: '../secret' }] }) }), tag);
  await assert.rejects(broken.linkTypes(), /Malformed/);
});

test('service binds site and root to Forge context, ignores forged browser root', () => {
  assert.equal(contextScope(context, { ...payload, root_key: 'SECRET-1', site_id: 'other' }).root_key, 'APP-1');
  assert.equal(contextScope(context, payload).site_id, 'fictional-demo-site');
  assert.throws(() => contextScope({}, payload), /issue panel/);
});

test('capture/recheck service uses the same collector; wrong tenant baselines are rejected before queries', async () => {
  const data = JSON.parse(await readFile(fixturePath)); let requests = 0;
  const underlying = fixtureProvider(data);
  const provider = { ...underlying, linkTypes: async () => [{ id: '10000' }], search: async (...args) => { requests++; return underlying.search(...args); } };
  const service = createService(provider, { now: () => '2026-11-05T12:00:00Z' });
  const first = await service.capture({ context, payload });
  const second = await service.recheck({ context, payload: { ...payload, baseline: JSON.stringify(first.snapshot) } });
  assert.equal(second.comparison.verdict, 'no_observed_drift');
  const baseline = structuredClone(first.snapshot); baseline.scope.site_id = 'different-tenant';
  const { digest, ...raw } = baseline;
  const before = requests;
  await assert.rejects(service.recheck({ context, payload: { ...payload, baseline: JSON.stringify(sealSnapshot(raw)) } }), /different site/);
  assert.equal(requests, before);
});

test('a deleted or unconfigured link type cannot produce a misleading empty graph', async () => {
  const service = createService({ linkTypes: async () => [], search: async () => { throw new Error('must not query'); } });
  await assert.rejects(service.capture({ context, payload }), /no longer exists/);
});

test('HTML reports escape Jira content and include explicit unknown and checksum caveats', async () => {
  const baseline = await snapshotFixture(fixturePath);
  baseline.issues[0].summary = '<script>alert("jira")</script>';
  const { digest, ...raw } = baseline;
  const html = renderReport(sealSnapshot(raw));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('No automatic approval'));
  assert.ok(html.includes('checksum detects edits, not authorship'));
});

test('actual CLI demo creates usable frozen evidence and refuses overwriting it', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'dependency-cli-'));
  try {
    const args = ['src/cli.js', 'demo', '--out', join(temp, 'demo')];
    const result = spawnSync(process.execPath, args, { cwd: resolve(import.meta.dirname, '..'), encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).actual_jira_calls, 0);
    const baseline = JSON.parse(await readFile(join(temp, 'demo/baseline.json'))), current = JSON.parse(await readFile(join(temp, 'demo/current.json')));
    assert.equal(compare(baseline, current).verdict, 'requires_review');
    assert.ok((await readFile(join(temp, 'demo/report.html'), 'utf8')).includes('SEC-4'));
    const before = await readFile(join(temp, 'demo/baseline.json'), 'utf8');
    const again = spawnSync(process.execPath, args, { cwd: resolve(import.meta.dirname, '..'), encoding: 'utf8' });
    assert.equal(again.status, 2); assert.match(again.stderr, /Output exists/);
    assert.equal(await readFile(join(temp, 'demo/baseline.json'), 'utf8'), before);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
