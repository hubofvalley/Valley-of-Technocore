import { createHash, randomUUID } from 'node:crypto';
import { parseStrictJson, verifyEvidence } from './cli.js';
import { ActionsConflictError, ActionsInputError, ActionsNotFoundError } from './actions.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ISO_DATE = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u;
const hasOwn = (value, key) => Object.hasOwn(value, key);

export const WORKFLOWS = Object.freeze(Object.assign(Object.create(null), {
  'proof.receipt.v1': Object.freeze({
    label: 'Verify & export proof receipt',
    description: 'Verify supplied Valley evidence, then generate a portable local receipt.',
    fields: [
      { name: 'label', label: 'Receipt label', max_length: 80 },
      { name: 'evidence_json', label: 'Evidence JSON', max_length: 65536 }
    ],
    steps: [
      { id: 'verify-evidence', label: 'Verify evidence' },
      { id: 'format-receipt', label: 'Format proof receipt' }
    ]
  })
}));

function exactObject(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ActionsInputError(`${label} must be an object`);
  const actual = Object.keys(value).sort(); const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new ActionsInputError(`${label} has missing or unknown fields`);
}
function validId(value, label) { if (typeof value !== 'string' || !UUID.test(value)) throw new ActionsInputError(`${label} must be a UUID`); }
function validDate(value, label) { if (typeof value !== 'string' || !ISO_DATE.test(value) || Number.isNaN(Date.parse(value))) throw new ActionsInputError(`${label} must be an ISO timestamp`); }
function validString(value, label) { if (typeof value !== 'string' || value.includes('\u0000')) throw new ActionsInputError(`${label} must be a string without NUL`); }
function workflowFor(value) { if (typeof value !== 'string' || !hasOwn(WORKFLOWS, value)) throw new ActionsInputError('workflow is not allowlisted'); return WORKFLOWS[value]; }
function cleanInputs(workflow, inputs) {
  exactObject(inputs, workflow.fields.map((field) => field.name), 'inputs'); const clean = Object.create(null);
  for (const field of workflow.fields) { const value = inputs[field.name]; if (typeof value !== 'string' || value.length < 1 || value.length > field.max_length || value.includes('\u0000')) throw new ActionsInputError(`${field.name} must be a non-empty string of at most ${field.max_length} characters`); clean[field.name] = value; }
  return clean;
}
function step(id, label, status, output, error, exitCode) { return { id, label, status, output, error, exit_code: exitCode }; }
function receipt(label, report, createdAt) {
  const evidence_sha256 = `sha256:${createHash('sha256').update(report._evidence_bytes, 'utf8').digest('hex')}`;
  const verification = { ...report }; delete verification._evidence_bytes;
  const body = { schema: 'gv.valley-of-technocore.proof-receipt/1', label, created_at: createdAt, evidence_sha256, verification };
  return { json: JSON.stringify(body, null, 2), markdown: `# Proof receipt\n\n- Label: ${label}\n- Created: ${createdAt}\n- Evidence SHA-256: ${evidence_sha256}\n- Payload hash: ${verification.payload_hash_status}\n- Signature: ${verification.signature_status}\n\n\`\`\`json\n${JSON.stringify(verification)}\n\`\`\`\n` };
}
function verifiedReport(evidenceJson) {
  const report = verifyEvidence(parseStrictJson(evidenceJson)); return { ...report, _evidence_bytes: evidenceJson };
}

export function workflowCatalogue() { return Object.entries(WORKFLOWS).map(([id, workflow]) => ({ id, label: workflow.label, description: workflow.description, fields: workflow.fields, steps: workflow.steps })); }
export function getWorkflow(id) { const workflow = workflowFor(id); return { id, label: workflow.label, description: workflow.description, fields: workflow.fields, steps: workflow.steps }; }
export function listWorkflowRuns(state, workflowId) { if (workflowId !== undefined) workflowFor(workflowId); return state.workflow_runs.filter((run) => workflowId === undefined || run.workflow === workflowId).slice().reverse(); }
export function getWorkflowRun(state, id) { const run = state.workflow_runs.find((item) => item.id === id); if (!run) throw new ActionsNotFoundError('workflow run not found'); return run; }

export function runWorkflow(state, workflowId, request, now = new Date().toISOString()) {
  exactObject(request, ['inputs'], 'workflow run'); const workflow = workflowFor(workflowId); const inputs = cleanInputs(workflow, request.inputs);
  const run = { id: randomUUID(), workflow: workflowId, status: 'running', inputs, steps: [], receipt: null, started_at: now, finished_at: null, retry_of: null };
  state.workflow_runs.push(run);
  let report;
  try { report = verifiedReport(inputs.evidence_json); }
  catch { run.steps.push(step('verify-evidence', 'Verify evidence', 'failed', '', 'Evidence input is malformed or unsupported.', 2)); run.status = 'failed'; run.finished_at = now; return run; }
  const output = { ...report }; delete output._evidence_bytes; const valid = report.payload_hash_status === 'valid' && report.signature_status === 'valid';
  if (!valid) { run.steps.push(step('verify-evidence', 'Verify evidence', 'failed', JSON.stringify(output), 'Evidence verification failed.', 3)); run.status = 'failed'; run.finished_at = now; return run; }
  run.steps.push(step('verify-evidence', 'Verify evidence', 'succeeded', JSON.stringify(output), '', 0));
  run.receipt = receipt(inputs.label, report, now); run.steps.push(step('format-receipt', 'Format proof receipt', 'succeeded', 'Proof receipt is ready for browser export.', '', 0)); run.status = 'succeeded'; run.finished_at = now; return run;
}
export function retryWorkflowRun(state, id, now) { const prior = getWorkflowRun(state, id); if (prior.status !== 'failed') throw new ActionsConflictError('only failed workflow runs can be retried'); const run = runWorkflow(state, prior.workflow, { inputs: prior.inputs }, now); run.retry_of = prior.id; return run; }

export function validateWorkflowRuns(runs) {
  const ids = new Set();
  for (const run of runs) {
    exactObject(run, ['id', 'workflow', 'status', 'inputs', 'steps', 'receipt', 'started_at', 'finished_at', 'retry_of'], 'stored workflow run'); validId(run.id, 'stored workflow run id'); const workflow = workflowFor(run.workflow); cleanInputs(workflow, run.inputs);
    if (!['succeeded', 'failed'].includes(run.status) || !Array.isArray(run.steps) || run.steps.length < 1 || run.steps.length > workflow.steps.length) throw new ActionsInputError('stored workflow run is invalid');
    for (let index = 0; index < run.steps.length; index += 1) { const item = run.steps[index]; const expected = workflow.steps[index]; exactObject(item, ['id', 'label', 'status', 'output', 'error', 'exit_code'], 'stored workflow step'); if (item.id !== expected.id || item.label !== expected.label || !['succeeded', 'failed'].includes(item.status)) throw new ActionsInputError('stored workflow step is invalid'); validString(item.output, 'stored workflow step output'); validString(item.error, 'stored workflow step error'); if (!Number.isInteger(item.exit_code) || item.exit_code < 0) throw new ActionsInputError('stored workflow step exit code is invalid'); }
    let report; try { report = verifiedReport(run.inputs.evidence_json); } catch { report = null; }
    const output = report ? { ...report } : null; if (output) delete output._evidence_bytes;
    const valid = output?.payload_hash_status === 'valid' && output?.signature_status === 'valid';
    const first = run.steps[0];
    if (!report) {
      if (run.status !== 'failed' || run.steps.length !== 1 || run.receipt !== null || first.status !== 'failed' || first.output !== '' || first.error !== 'Evidence input is malformed or unsupported.' || first.exit_code !== 2) throw new ActionsInputError('stored workflow run is inconsistent');
    } else if (!valid) {
      if (run.status !== 'failed' || run.steps.length !== 1 || run.receipt !== null || first.status !== 'failed' || first.output !== JSON.stringify(output) || first.error !== 'Evidence verification failed.' || first.exit_code !== 3) throw new ActionsInputError('stored workflow run is inconsistent');
    } else {
      const expected = receipt(run.inputs.label, report, run.started_at);
      const second = run.steps[1];
      if (run.status !== 'succeeded' || run.steps.length !== 2 || first.status !== 'succeeded' || first.output !== JSON.stringify(output) || first.error !== '' || first.exit_code !== 0 || second.status !== 'succeeded' || second.output !== 'Proof receipt is ready for browser export.' || second.error !== '' || second.exit_code !== 0 || !run.receipt || run.receipt.json !== expected.json || run.receipt.markdown !== expected.markdown) throw new ActionsInputError('stored workflow run is inconsistent');
    }
    if (run.receipt !== null) { exactObject(run.receipt, ['json', 'markdown'], 'stored workflow receipt'); validString(run.receipt.json, 'stored workflow receipt json'); validString(run.receipt.markdown, 'stored workflow receipt markdown'); }
    validDate(run.started_at, 'stored workflow run started_at'); validDate(run.finished_at, 'stored workflow run finished_at'); if (run.retry_of !== null) validId(run.retry_of, 'stored workflow run retry_of'); if (ids.has(run.id)) throw new ActionsInputError('stored workflow runs must have unique ids'); ids.add(run.id);
  }
  for (const run of runs) if (run.retry_of !== null && !ids.has(run.retry_of)) throw new ActionsInputError('stored workflow run retry_of is unknown'); return runs;
}
