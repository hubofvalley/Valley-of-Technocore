import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createActionsServer } from '../src/actions-server.js';
import { loadState, saveState, withStateTransaction } from '../src/actions-store.js';
import { createAction, newState } from '../src/actions.js';

async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'valley-actions-')); const state = join(directory, 'actions.json');
  const server = createActionsServer(state); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.close(); rmSync(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const csrf = /const csrf='([^']+)'/u.exec(await (await fetch(base)).text())[1];
  const api = async (path, method = 'GET', body) => {
    const response = await fetch(base + path, { method, headers: body === undefined ? {} : { 'content-type': 'application/json', origin: base, 'x-valley-csrf': csrf }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  return { api, base, state };
}

test('serves a usable Actions index', async (t) => {
  const { base } = await fixture(t); const response = await fetch(base);
  assert.equal(response.status, 200); const html = await response.text();
  for (const phrase of ['Create action', 'Actions index', 'Run history', 'Retry failed run']) assert.match(html, new RegExp(phrase, 'u'));
  assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/u);
});

test('creates, lists, runs, and inspects a successful action', async (t) => {
  const { api, state } = await fixture(t);
  const created = await api('/api/actions', 'POST', { name: 'Uppercase greeting', operation: 'text.uppercase' });
  assert.equal(created.status, 201); assert.deepEqual(created.body.input_fields.map((field) => field.name), ['text']);
  const listed = await api('/api/actions'); assert.equal(listed.body.actions.length, 1); assert.equal(listed.body.actions[0].run_count, 0);
  const run = await api(`/api/actions/${created.body.id}/runs`, 'POST', { inputs: { text: 'hello valley' } });
  assert.equal(run.status, 201); assert.equal(run.body.status, 'succeeded'); assert.equal(run.body.output, 'HELLO VALLEY'); assert.equal(run.body.exit_code, 0);
  const inspected = await api(`/api/runs/${run.body.id}`); assert.deepEqual(inspected.body.inputs, { text: 'hello valley' }); assert.equal(typeof inspected.body.duration_ms, 'number');
  const action = await api(`/api/actions/${created.body.id}`); assert.equal(action.body.runs.length, 1);
  assert.equal(statSync(state).mode & 0o777, 0o600); assert.equal(JSON.parse(readFileSync(state)).runs.length, 1);
});

test('records failure, retries it, and keeps run history', async (t) => {
  const { api } = await fixture(t);
  const action = (await api('/api/actions', 'POST', { name: 'JSON check', operation: 'json.pretty' })).body;
  const failed = await api(`/api/actions/${action.id}/runs`, 'POST', { inputs: { json: '{bad' } });
  assert.equal(failed.body.status, 'failed'); assert.equal(failed.body.error, 'Input is not valid JSON.'); assert.equal(failed.body.exit_code, 1);
  const retry = await api(`/api/runs/${failed.body.id}/retry`, 'POST', {});
  assert.equal(retry.status, 201); assert.equal(retry.body.status, 'failed'); assert.equal(retry.body.retry_of, failed.body.id);
  const history = await api(`/api/actions/${action.id}`); assert.equal(history.body.runs.length, 2); assert.equal(history.body.runs[0].id, retry.body.id);
  const allRuns = await api('/api/runs'); assert.equal(allRuns.body.runs.length, 2);
});

test('runs the product evidence verifier through the Actions surface', async (t) => {
  const { api } = await fixture(t);
  const evidence = readFileSync(new URL('../fixtures/valid-evidence.json', import.meta.url), 'utf8');
  const action = (await api('/api/actions', 'POST', { name: 'Verify supplied evidence', operation: 'evidence.verify.v1' })).body;
  const valid = await api(`/api/actions/${action.id}/runs`, 'POST', { inputs: { evidence_json: evidence } });
  assert.equal(valid.body.status, 'succeeded'); assert.equal(valid.body.exit_code, 0); assert.match(valid.body.output, /"signature_status":"valid"/u);
  const altered = JSON.parse(evidence); altered.statement.payload_sha256 = `sha256:${'0'.repeat(64)}`;
  const invalid = await api(`/api/actions/${action.id}/runs`, 'POST', { inputs: { evidence_json: JSON.stringify(altered) } });
  assert.equal(invalid.body.status, 'failed'); assert.equal(invalid.body.exit_code, 3); assert.match(invalid.body.output, /"payload_hash_status":"invalid"/u);
});

test('accepts the documented maximum evidence field over HTTP', async (t) => {
  const { api } = await fixture(t);
  const action = (await api('/api/actions', 'POST', { name: 'Large evidence', operation: 'evidence.verify.v1' })).body;
  const run = await api(`/api/actions/${action.id}/runs`, 'POST', { inputs: { evidence_json: 'x'.repeat(65536) } });
  assert.equal(run.status, 201); assert.equal(run.body.status, 'failed'); assert.equal(run.body.exit_code, 2);
});

test('rejects arbitrary operations, malformed inputs, cross-origin writes, and retry of success', async (t) => {
  const { api, base } = await fixture(t);
  for (const operation of ['shell.exec', '__proto__', 'constructor', 'toString']) assert.equal((await api('/api/actions', 'POST', { name: `Rejected ${operation}`, operation })).status, 400);
  const action = (await api('/api/actions', 'POST', { name: 'Safe', operation: 'text.uppercase' })).body;
  assert.equal((await api(`/api/actions/${action.id}/runs`, 'POST', { inputs: { text: 'ok', extra: 'no' } })).status, 400);
  const forbidden = await fetch(base + '/api/actions', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.invalid' }, body: JSON.stringify({ name: 'No', operation: 'text.uppercase' }) });
  assert.equal(forbidden.status, 403);
  const run = (await api(`/api/actions/${action.id}/runs`, 'POST', { inputs: { text: 'ok' } })).body;
  assert.equal((await api(`/api/runs/${run.id}/retry`, 'POST', {})).status, 409);
});

test('rejects tampered persisted state before it can reach the UI', async (t) => {
  const { api, state } = await fixture(t);
  writeFileSync(state, JSON.stringify({ schema: 'gv.valley-of-technocore.actions/1', actions: [{ id: '00000000-0000-4000-8000-000000000000', name: '<img src=x onerror=alert(1)>', operation: 'text.uppercase', created_at: '2026-01-01T00:00:00.000Z', unexpected: true }], runs: [] }));
  const response = await api('/api/actions'); assert.equal(response.status, 400); assert.equal(response.body.error, 'stored action has missing or unknown fields');
});

test('enforces the state cap before read and before write, and clears a dead lock', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'valley-actions-store-')); const statePath = join(directory, 'actions.json'); t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(statePath, Buffer.alloc(8 * 1024 * 1024 + 1)); assert.throws(() => loadState(statePath), /state exceeds 8 MiB/u);
  rmSync(statePath); const state = newState(); createAction(state, { name: 'Cap test', operation: 'text.uppercase' });
  state.runs.push({ id: '00000000-0000-4000-8000-000000000001', action_id: state.actions[0].id, action_name: 'Cap test', operation: 'text.uppercase', status: 'failed', inputs: { text: 'x' }, output: 'x'.repeat(8 * 1024 * 1024), error: '', exit_code: 1, started_at: '2026-01-01T00:00:00.000Z', finished_at: '2026-01-01T00:00:00.000Z', duration_ms: 0, retry_of: null });
  assert.throws(() => saveState(statePath, state), /state exceeds 8 MiB/u); assert.equal(existsSync(statePath), false);
  writeFileSync(`${statePath}.lock`, '99999999\n', { mode: 0o600 }); const result = withStateTransaction(statePath, (fresh) => createAction(fresh, { name: 'After stale lock', operation: 'text.uppercase' }));
  assert.equal(result.name, 'After stale lock'); assert.equal(existsSync(`${statePath}.lock`), false);
});
