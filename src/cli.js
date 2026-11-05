import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, collect, compare, InputError, scopeFor, validateSnapshot } from './evidence.js';
import { fixtureProvider } from './fixture-provider.js';
import { renderReport } from './report.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
export async function readJson(path) {
  const raw = await readFile(path);
  if (raw.length > 300000) throw new InputError('Input exceeds 300 KB');
  try { return JSON.parse(raw); } catch { throw new InputError('Invalid JSON input'); }
}
async function save(path, content) {
  await mkdir(dirname(resolve(path)), { recursive: true });
  await writeFile(path, content, { flag: 'wx', mode: 0o600 });
}
export async function snapshotFixture(path) {
  const fixture = await readJson(path);
  return collect(scopeFor(fixture.site_id, fixture.root_key, fixture.link_type_ids, fixture.direction), fixtureProvider(fixture), { capturedAt: fixture.captured_at, source: 'offline-fixture' });
}
export async function demo(out) {
  await mkdir(dirname(resolve(out)), { recursive: true });
  await mkdir(out); // Never overwrite a previously saved review record.
  const baseline = await snapshotFixture(resolve(ROOT, 'fixtures/baseline.json'));
  const current = await snapshotFixture(resolve(ROOT, 'fixtures/current.json'));
  const comparison = compare(baseline, current);
  for (const [name, data] of [['baseline', baseline], ['current', current], ['comparison', comparison]]) await save(resolve(out, name + '.json'), JSON.stringify(data, null, 2) + '\n');
  await save(resolve(out, 'report.html'), renderReport(current, comparison));
  return { output: resolve(out), verdict: comparison.verdict, changed_issues: comparison.changes.length, status: comparison.current_report.status, actual_jira_calls: 0, deployed: false };
}

export async function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  if (command === '--help' || !command) {
    console.log('node src/cli.js demo --out NEW_DIRECTORY\nnode src/cli.js snapshot --fixture FILE --out NEW_JSON\nnode src/cli.js report --snapshot FILE --out NEW_HTML\nnode src/cli.js compare --baseline FILE --current FILE --out NEW_HTML\nOffline only. Existing output files are never overwritten.'); return 0;
  }
  const options = {};
  for (let index = 0; index < rest.length; index += 2) {
    if (!/^--[a-z-]+$/.test(rest[index]) || !rest[index + 1] || rest[index + 1].startsWith('--') || rest[index] in options) throw new InputError('Use each named option once with a value');
    options[rest[index]] = rest[index + 1];
  }
  const allowed = { demo: ['--out'], snapshot: ['--fixture', '--out'], report: ['--snapshot', '--out'], compare: ['--baseline', '--current', '--out'] }[command];
  if (!allowed || Object.keys(options).sort().join() !== [...allowed].sort().join()) throw new InputError('Unknown command or incomplete options; use --help');
  let result;
  if (command === 'demo') result = await demo(options['--out']);
  else if (command === 'snapshot') {
    const snapshot = await snapshotFixture(options['--fixture']); await save(options['--out'], JSON.stringify(snapshot, null, 2) + '\n'); result = { snapshot: resolve(options['--out']), report: analyze(snapshot) };
  } else if (command === 'report') {
    const snapshot = validateSnapshot(await readJson(options['--snapshot'])); await save(options['--out'], renderReport(snapshot)); result = analyze(snapshot);
  } else {
    const current = validateSnapshot(await readJson(options['--current'])); result = compare(await readJson(options['--baseline']), current); await save(options['--out'], renderReport(current, result));
  }
  console.log(JSON.stringify(result, null, 2)); return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }).catch(error => { console.error(JSON.stringify({ error: error instanceof InputError ? error.message : error.code === 'EEXIST' ? 'Output exists; choose a new path to preserve the saved review.' : 'Local workflow failed; check paths and input. No Jira issue was changed.' })); process.exitCode = 2; });
}
