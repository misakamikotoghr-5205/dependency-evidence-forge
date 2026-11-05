import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Button, Heading, Label, SectionMessage, Select, Stack, Text, TextArea } from '@forge/react';
import { invoke } from '@forge/bridge';

function Evidence({ report }) {
  if (!report) return null;
  return <Stack space="space.100">
    <Heading as="h3">{report.status.replaceAll('_', ' ')}</Heading>
    <Text>{report.reachable_count} reachable work items. Human review required; no automatic sign-off.</Text>
    {report.blockers.map(item => <Text key={'block-' + item.key}>Blocker: {item.path.join(' → ')} — {item.status}</Text>)}
    {report.unknown.map(item => <Text key={'unknown-' + item.key}>Unknown: {item.path.join(' → ')} — {item.availability}</Text>)}
    {report.cycles.map(group => <Text key={'cycle-' + group.join()}>Dependency cycle group: {group.join(', ')}</Text>)}
    {report.notices.map((note, index) => <Text key={'notice-' + index}>{note}</Text>)}
    <Text>{report.caveat}</Text>
  </Stack>;
}

function App() {
  const [types, setTypes] = useState([]), [selected, setSelected] = useState(null), [direction, setDirection] = useState({ value: 'inward', label: 'Follow inwardIssue (check its label below)' });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState(null), [baseline, setBaseline] = useState('');
  async function call(operation, payload) {
    const response = await invoke(operation, payload);
    if (!response || typeof response !== 'object' || !('ok' in response) || response.ok !== true || !('data' in response)) {
      const message = response && typeof response === 'object' && 'error' in response && typeof response.error === 'string' ? response.error : 'Evidence unavailable';
      throw new Error(message);
    }
    return response.data;
  }
  useEffect(() => { let active = true;
    call('linkTypes').then(data => { if (active) setTypes(data); }).catch(() => { if (active) setError('Cannot load Jira link types. Check consent, Jira access and installation.'); });
    return () => { active = false; };
  }, []);
  async function run(operation) {
    setBusy(true); setError(''); setResult(null);
    try { setResult(await call(operation, { link_type_ids: selected ? [selected.value] : [], direction: direction.value, ...(operation === 'recheck' ? { baseline } : {}) })); }
    catch (failure) { setError(failure.message || 'Evidence unavailable; no Jira issue was changed.'); }
    finally { setBusy(false); }
  }
  const type = types.find(item => item.id === selected?.value);
  const report = result?.report || result?.comparison?.current_report;
  return <Stack space="space.200">
    <Heading as="h2">Dependency Evidence</Heading>
    <Text>Freeze what you reviewed, then recheck it before acting. This app only reads Jira and does not approve releases or edit issues.</Text>
    {error && <SectionMessage appearance="error" title="Evidence unavailable"><Text>{error}</Text></SectionMessage>}
    <Label labelFor="link-type">Dependency link type</Label>
    <Select id="link-type" options={types.map(item => ({ value: item.id, label: `${item.name} (${item.id})` }))} value={selected} onChange={value => { setSelected(value); setResult(null); }} isDisabled={busy} />
    <Label labelFor="direction">Which endpoint is the prerequisite?</Label>
    <Select id="direction" options={[{ value: 'inward', label: 'Follow inwardIssue' }, { value: 'outward', label: 'Follow outwardIssue' }]} value={direction} onChange={value => { setDirection(value); setResult(null); }} isDisabled={busy} />
    <Text>{type ? `Jira descriptions: inward = “${type.inward}”; outward = “${type.outward}”. Confirm your site’s meaning before capturing.` : 'Choose the actual dependency type. Related/duplicate links are not automatically treated as prerequisites.'}</Text>
    <Button onClick={() => run('capture')} isDisabled={busy || !selected}>{busy ? 'Collecting evidence…' : 'Capture current evidence'}</Button>
    <Evidence report={report} />
    {result?.comparison && <Stack space="space.100">
      <Heading as="h3">{result.comparison.verdict.replaceAll('_', ' ')}</Heading>
      <Text>{result.comparison.note}</Text>
      {result.comparison.changes.map(change => <Text key={change.key}>{change.key}: {change.fields.join(', ')}</Text>)}
    </Stack>}
    {result?.snapshot && <Stack space="space.100">
      <Text>Copy this JSON to your own private review record. The app does not store snapshots on the server. SHA256 detects edits; it is not a signature or proof of authorship.</Text>
      <Label labelFor="captured">Current evidence JSON</Label>
      <TextArea id="captured" value={JSON.stringify(result.snapshot, null, 2)} isReadOnly resize="vertical" minimumRows={8} />
      <Button onClick={() => setBaseline(JSON.stringify(result.snapshot, null, 2))} isDisabled={busy}>Use this as baseline</Button>
    </Stack>}
    <Label labelFor="baseline">Saved baseline JSON</Label>
    <TextArea id="baseline" value={baseline} onChange={event => setBaseline(event.target.value)} resize="vertical" minimumRows={8} isDisabled={busy} />
    <Button onClick={() => run('recheck')} isDisabled={busy || !selected || !baseline.trim()}>Recheck saved evidence</Button>
    <Text>Only the current caller’s visible data is collected, in bounded paginated searches. Missing/hidden/rate-limited records stay unknown. Status category “done” is a Jira field, not independent proof that work was completed.</Text>
  </Stack>;
}

ForgeReconciler.render(<React.StrictMode><App /></React.StrictMode>);
