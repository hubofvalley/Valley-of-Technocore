import { randomUUID } from 'node:crypto';
import { parseStrictJson, verifyEvidence } from './cli.js';
import { validateWorkflowRuns } from './workflows.js';

export const ACTIONS_SCHEMA = 'gv.valley-of-technocore.actions/2';
export const OPERATIONS = Object.freeze(Object.assign(Object.create(null), {
  'evidence.verify.v1': {
    label: 'Verify evidence', description: 'Verify one local Valley evidence JSON object.',
    fields: [{ name: 'evidence_json', label: 'Evidence JSON', max_length: 65536 }],
    execute: ({ evidence_json }) => {
      try {
        const report = verifyEvidence(parseStrictJson(evidence_json));
        const valid = report.payload_hash_status === 'valid' && report.signature_status === 'valid';
        return { output: JSON.stringify(report), error: valid ? '' : 'Evidence verification failed.', exit_code: valid ? 0 : 3 };
      } catch { return { output: '', error: 'Evidence input is malformed or unsupported.', exit_code: 2 }; }
    }
  },
  'text.uppercase': {
    label: 'Uppercase text', description: 'Convert supplied text to uppercase.',
    fields: [{ name: 'text', label: 'Text', max_length: 4096 }],
    execute: ({ text }) => ({ output: text.toUpperCase(), error: '', exit_code: 0 })
  },
  'text.require-equal': {
    label: 'Require equal text', description: 'Succeed only when the two supplied values match exactly.',
    fields: [{ name: 'actual', label: 'Actual value', max_length: 4096 }, { name: 'expected', label: 'Expected value', max_length: 4096 }],
    execute: ({ actual, expected }) => actual === expected
      ? { output: 'Values match.', error: '', exit_code: 0 }
      : { output: '', error: 'Values do not match.', exit_code: 1 }
  },
  'json.pretty': {
    label: 'Format JSON', description: 'Parse and format one JSON value.',
    fields: [{ name: 'json', label: 'JSON value', max_length: 16384 }],
    execute: ({ json }) => {
      try { return { output: JSON.stringify(JSON.parse(json), null, 2), error: '', exit_code: 0 }; }
      catch { return { output: '', error: 'Input is not valid JSON.', exit_code: 1 }; }
    }
  }
}));

export class ActionsInputError extends Error {}
export class ActionsNotFoundError extends Error {}
export class ActionsConflictError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ISO_DATE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u;
const hasOwn = (value, key) => Object.hasOwn(value, key);

function exactObject(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ActionsInputError(`${label} must be an object`);
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new ActionsInputError(`${label} has missing or unknown fields`);
}

function cleanName(value) {
  if (typeof value !== 'string') throw new ActionsInputError('name must be a string');
  const name = value.trim();
  if (name.length < 1 || name.length > 80 || /[\u0000-\u001f\u007f]/u.test(name)) throw new ActionsInputError('name must contain 1-80 printable characters');
  return name;
}

function operationFor(value) {
  if (typeof value !== 'string' || !hasOwn(OPERATIONS, value)) throw new ActionsInputError('operation is not allowlisted');
  return OPERATIONS[value];
}

function validId(value, label) { if (typeof value !== 'string' || !UUID.test(value)) throw new ActionsInputError(`${label} must be a UUID`); }
function validDate(value, label) { if (typeof value !== 'string' || !ISO_DATE.test(value) || Number.isNaN(Date.parse(value))) throw new ActionsInputError(`${label} must be an ISO timestamp`); }
function validString(value, label) { if (typeof value !== 'string' || value.includes('\u0000')) throw new ActionsInputError(`${label} must be a string without NUL`); }

export function newState() { return { schema: ACTIONS_SCHEMA, actions: [], runs: [], workflow_runs: [] }; }
export function operationCatalogue() { return Object.entries(OPERATIONS).map(([id, operation]) => ({ id, label: operation.label, description: operation.description, fields: operation.fields })); }

function actionView(action) { return { ...action, input_fields: operationFor(action.operation).fields }; }

function validateInputs(operation, inputs) {
  exactObject(inputs, operation.fields.map((field) => field.name), 'inputs');
  const clean = Object.create(null);
  for (const field of operation.fields) {
    const value = inputs[field.name];
    if (typeof value !== 'string' || value.length > field.max_length || value.includes('\u0000')) throw new ActionsInputError(`${field.name} must be a string of at most ${field.max_length} characters`);
    clean[field.name] = value;
  }
  return clean;
}

export function validateState(state) {
  exactObject(state, ['schema', 'actions', 'runs', 'workflow_runs'], 'state');
  if (state.schema !== ACTIONS_SCHEMA || !Array.isArray(state.actions) || !Array.isArray(state.runs) || !Array.isArray(state.workflow_runs)) throw new ActionsInputError('unsupported state');
  const actions = new Set(); const runs = new Set(); const actionIds = new Set(); const names = new Set();
  for (const action of state.actions) {
    exactObject(action, ['id', 'name', 'operation', 'created_at'], 'stored action'); validId(action.id, 'stored action id'); cleanName(action.name); operationFor(action.operation); validDate(action.created_at, 'stored action created_at');
    if (actions.has(action.id) || names.has(action.name.toLowerCase())) throw new ActionsInputError('stored actions must have unique ids and names');
    actions.add(action.id); names.add(action.name.toLowerCase()); actionIds.add(action.id);
  }
  for (const run of state.runs) {
    exactObject(run, ['id', 'action_id', 'action_name', 'operation', 'status', 'inputs', 'output', 'error', 'exit_code', 'started_at', 'finished_at', 'duration_ms', 'retry_of'], 'stored run');
    validId(run.id, 'stored run id'); validId(run.action_id, 'stored run action_id'); if (!actionIds.has(run.action_id)) throw new ActionsInputError('stored run references an unknown action');
    const operation = operationFor(run.operation); validString(run.action_name, 'stored run action_name'); validateInputs(operation, run.inputs);
    if (!['succeeded', 'failed'].includes(run.status)) throw new ActionsInputError('stored run must be terminal');
    validString(run.output, 'stored run output'); validString(run.error, 'stored run error');
    if (!Number.isInteger(run.exit_code) || run.exit_code < 0 || (run.status === 'succeeded') !== (run.exit_code === 0)) throw new ActionsInputError('stored run has an invalid exit code');
    validDate(run.started_at, 'stored run started_at'); validDate(run.finished_at, 'stored run finished_at');
    if (!Number.isInteger(run.duration_ms) || run.duration_ms < 0) throw new ActionsInputError('stored run duration is invalid');
    if (run.retry_of !== null) validId(run.retry_of, 'stored run retry_of');
    if (runs.has(run.id)) throw new ActionsInputError('stored runs must have unique ids'); runs.add(run.id);
  }
  for (const run of state.runs) if (run.retry_of !== null && !runs.has(run.retry_of)) throw new ActionsInputError('stored run retry_of is unknown');
  validateWorkflowRuns(state.workflow_runs);
  return state;
}

export function createAction(state, request, now = new Date().toISOString()) {
  exactObject(request, ['name', 'operation'], 'action'); const name = cleanName(request.name); const operation = operationFor(request.operation);
  if (state.actions.some((action) => action.name.toLowerCase() === name.toLowerCase())) throw new ActionsConflictError('action name already exists');
  const action = { id: randomUUID(), name, operation: request.operation, created_at: now }; state.actions.push(action); return actionView(action);
}

export function listActions(state) { return state.actions.map((action) => ({ ...actionView(action), run_count: state.runs.filter((run) => run.action_id === action.id).length })); }
export function getAction(state, id) { const action = state.actions.find((item) => item.id === id); if (!action) throw new ActionsNotFoundError('action not found'); return { ...actionView(action), runs: state.runs.filter((run) => run.action_id === id).slice().reverse() }; }

export function runAction(state, actionId, request, clock = () => Date.now()) {
  exactObject(request, ['inputs'], 'run'); const action = state.actions.find((item) => item.id === actionId); if (!action) throw new ActionsNotFoundError('action not found');
  const operation = operationFor(action.operation); const inputs = validateInputs(operation, request.inputs); const started = clock();
  const run = { id: randomUUID(), action_id: action.id, action_name: action.name, operation: action.operation, status: 'running', inputs, output: '', error: '', exit_code: null, started_at: new Date(started).toISOString(), finished_at: null, duration_ms: null, retry_of: null };
  state.runs.push(run); const result = operation.execute(inputs); const finished = clock();
  Object.assign(run, result, { status: result.exit_code === 0 ? 'succeeded' : 'failed', finished_at: new Date(finished).toISOString(), duration_ms: Math.max(0, finished - started) }); return run;
}

export function getRun(state, id) { const run = state.runs.find((item) => item.id === id); if (!run) throw new ActionsNotFoundError('run not found'); return run; }
export function listRuns(state) { return state.runs.slice().reverse(); }
export function retryRun(state, id, clock) { const prior = getRun(state, id); if (prior.status !== 'failed') throw new ActionsConflictError('only failed runs can be retried'); const run = runAction(state, prior.action_id, { inputs: prior.inputs }, clock); run.retry_of = prior.id; return run; }
