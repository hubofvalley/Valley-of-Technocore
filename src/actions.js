import { randomUUID } from 'node:crypto';
import { parseStrictJson, verifyEvidence } from './cli.js';

export const ACTIONS_SCHEMA = 'gv.valley-of-technocore.actions/1';
export const OPERATIONS = Object.freeze({
  'evidence.verify.v1': {
    label: 'Verify evidence',
    description: 'Verify one local Valley evidence JSON object.',
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
    label: 'Uppercase text',
    description: 'Convert supplied text to uppercase.',
    fields: [{ name: 'text', label: 'Text', max_length: 4096 }],
    execute: ({ text }) => ({ output: text.toUpperCase(), error: '', exit_code: 0 })
  },
  'text.require-equal': {
    label: 'Require equal text',
    description: 'Succeed only when the two supplied values match exactly.',
    fields: [
      { name: 'actual', label: 'Actual value', max_length: 4096 },
      { name: 'expected', label: 'Expected value', max_length: 4096 }
    ],
    execute: ({ actual, expected }) => actual === expected
      ? { output: 'Values match.', error: '', exit_code: 0 }
      : { output: '', error: 'Values do not match.', exit_code: 1 }
  },
  'json.pretty': {
    label: 'Format JSON',
    description: 'Parse and format one JSON value.',
    fields: [{ name: 'json', label: 'JSON value', max_length: 16384 }],
    execute: ({ json }) => {
      try { return { output: JSON.stringify(JSON.parse(json), null, 2), error: '', exit_code: 0 }; }
      catch { return { output: '', error: 'Input is not valid JSON.', exit_code: 1 }; }
    }
  }
});

export class ActionsInputError extends Error {}
export class ActionsNotFoundError extends Error {}
export class ActionsConflictError extends Error {}

function cleanName(value) {
  if (typeof value !== 'string') throw new ActionsInputError('name must be a string');
  const name = value.trim();
  if (name.length < 1 || name.length > 80 || /[\u0000-\u001f\u007f]/u.test(name)) throw new ActionsInputError('name must contain 1-80 printable characters');
  return name;
}

function exactObject(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ActionsInputError(`${label} must be an object`);
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new ActionsInputError(`${label} has missing or unknown fields`);
}

export function newState() {
  return { schema: ACTIONS_SCHEMA, actions: [], runs: [] };
}

export function operationCatalogue() {
  return Object.entries(OPERATIONS).map(([id, operation]) => ({ id, label: operation.label, description: operation.description, fields: operation.fields }));
}

export function validateState(state) {
  exactObject(state, ['schema', 'actions', 'runs'], 'state');
  if (state.schema !== ACTIONS_SCHEMA || !Array.isArray(state.actions) || !Array.isArray(state.runs)) throw new ActionsInputError('unsupported state');
  return state;
}

export function createAction(state, request, now = new Date().toISOString()) {
  exactObject(request, ['name', 'operation'], 'action');
  const name = cleanName(request.name);
  const operation = OPERATIONS[request.operation];
  if (!operation) throw new ActionsInputError('operation is not allowlisted');
  if (state.actions.some((action) => action.name.toLowerCase() === name.toLowerCase())) throw new ActionsConflictError('action name already exists');
  const action = { id: randomUUID(), name, operation: request.operation, input_fields: operation.fields, created_at: now };
  state.actions.push(action);
  return action;
}

export function listActions(state) {
  return state.actions.map((action) => ({ ...action, run_count: state.runs.filter((run) => run.action_id === action.id).length }));
}

export function getAction(state, id) {
  const action = state.actions.find((item) => item.id === id);
  if (!action) throw new ActionsNotFoundError('action not found');
  return { ...action, runs: state.runs.filter((run) => run.action_id === id).slice().reverse() };
}

function validateInputs(action, inputs) {
  exactObject(inputs, action.input_fields.map((field) => field.name), 'inputs');
  const result = {};
  for (const field of action.input_fields) {
    const value = inputs[field.name];
    if (typeof value !== 'string' || value.length > field.max_length || /\u0000/u.test(value)) throw new ActionsInputError(`${field.name} must be a string of at most ${field.max_length} characters`);
    result[field.name] = value;
  }
  return result;
}

export function runAction(state, actionId, request, clock = () => Date.now()) {
  exactObject(request, ['inputs'], 'run');
  const action = state.actions.find((item) => item.id === actionId);
  if (!action) throw new ActionsNotFoundError('action not found');
  const inputs = validateInputs(action, request.inputs);
  const started = clock();
  const run = {
    id: randomUUID(), action_id: action.id, action_name: action.name, operation: action.operation,
    status: 'running', inputs, output: '', error: '', exit_code: null,
    started_at: new Date(started).toISOString(), finished_at: null, duration_ms: null, retry_of: null
  };
  state.runs.push(run);
  const result = OPERATIONS[action.operation].execute(inputs);
  const finished = clock();
  Object.assign(run, result, {
    status: result.exit_code === 0 ? 'succeeded' : 'failed',
    finished_at: new Date(finished).toISOString(), duration_ms: Math.max(0, finished - started)
  });
  return run;
}

export function getRun(state, id) {
  const run = state.runs.find((item) => item.id === id);
  if (!run) throw new ActionsNotFoundError('run not found');
  return run;
}

export function listRuns(state) { return state.runs.slice().reverse(); }

export function retryRun(state, id, clock) {
  const prior = getRun(state, id);
  if (prior.status !== 'failed') throw new ActionsConflictError('only failed runs can be retried');
  const run = runAction(state, prior.action_id, { inputs: prior.inputs }, clock);
  run.retry_of = prior.id;
  return run;
}
