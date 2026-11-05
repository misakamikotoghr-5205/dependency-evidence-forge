import { readFile, readdir, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { parse } from 'yaml';
import { demo } from '../src/cli.js';
import { handler } from '../src/index.js';

const root = resolve(import.meta.dirname, '..');
process.chdir(root);
function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', maxBuffer: 3_000_000 });
  if (result.status !== 0) { process.stderr.write(result.stdout + result.stderr); throw new Error('Verification failed: ' + args.join(' ')); }
  return result.stdout;
}
const tests = (await readdir('tests')).filter(name => name.endsWith('.test.js')).map(name => 'tests/' + name);
const tested = run(['--test', '--test-reporter=tap', ...tests]);
const count = Number(tested.match(/^# tests (\d+)/m)?.[1]);
assert.ok(count > 0);
run(['node_modules/typescript/bin/tsc', '--project', 'tsconfig.json']);
const frontend = await build({ entryPoints: ['src/frontend/index.jsx'], bundle: true, platform: 'browser', format: 'esm', write: false, logLevel: 'silent' });
const backend = await build({ entryPoints: ['src/index.js'], bundle: true, platform: 'node', target: 'node24', format: 'cjs', external: ['@forge/api', '@forge/resolver'], write: false, logLevel: 'silent' });
const manifest = parse(await readFile('manifest.yml', 'utf8'));
assert.deepEqual(manifest.permissions.scopes, ['read:jira-work']);
assert.equal(manifest.modules['jira:issuePanel'][0].render, 'native');
assert.equal(manifest.app.runtime.name, 'nodejs24.x');
for (const resource of manifest.resources) assert.ok((await readFile(resource.path)).length);
const sdkResult = await handler({ call: { functionKey: 'capture', payload: { link_type_ids: ['10000'], direction: 'inward' } }, context: {} });
assert.equal(sdkResult.ok, false); // Real SDK invocation, rejected before any network request.
await mkdir('output', { recursive: true });
const temporary = await mkdtemp(resolve('output', 'verified-'));
const demonstrated = await demo(resolve(temporary, 'demo'));
const verification = { verified_at: new Date().toISOString(), tests_passed: count,
  ui_typecheck: true, ui_bundle_bytes: frontend.outputFiles[0].contents.length, resolver_bundle_bytes: backend.outputFiles[0].contents.length,
  actual_sdk_handler_smoke: true, manifest_local_structure_checked: true,
  official_forge_lint_or_deploy_performed: false, jira_live_requests: 0, app_registered: false,
  demo: demonstrated, note: 'Local compile/contract tests and fictional fixtures only; real Jira installation and judge sharing link are still required.' };
await writeFile('output/verification.json', JSON.stringify(verification, null, 2) + '\n');
console.log(JSON.stringify(verification, null, 2));
