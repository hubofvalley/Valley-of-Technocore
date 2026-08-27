import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { ActionsConflictError, ActionsInputError, ActionsNotFoundError, createAction, getAction, getRun, listActions, listRuns, operationCatalogue, retryRun, runAction } from './actions.js';
import { loadState, withStateTransaction } from './actions-store.js';
import { getWorkflow, getWorkflowRun, listWorkflowRuns, retryWorkflowRun, runWorkflow, workflowCatalogue } from './workflows.js';

const MAX_BODY_BYTES = 512 * 1024;

const HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Valley Actions</title><style>
:root{color-scheme:dark;--bg:#0b1020;--panel:#151c31;--line:#2b3657;--text:#eef2ff;--muted:#9faccc;--accent:#7c9cff;--ok:#65d69e;--bad:#ff7b85}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,sans-serif}main{max-width:1050px;margin:auto;padding:32px 20px}h1,h2,h3{margin-top:0}.grid{display:grid;grid-template-columns:minmax(260px,1fr) minmax(360px,2fr);gap:20px}.panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:20px;margin-bottom:20px}label{display:block;margin:12px 0 5px;color:var(--muted)}input,select,textarea,button{width:100%;font:inherit;border-radius:7px;border:1px solid var(--line);padding:10px;background:#0e1528;color:var(--text)}textarea{min-height:90px;resize:vertical}button{background:var(--accent);color:#071027;font-weight:700;cursor:pointer;margin-top:14px}button.secondary{background:#263250;color:var(--text)}button:disabled{opacity:.5;cursor:not-allowed}a{color:#a9bcff}table{width:100%;border-collapse:collapse}th,td{text-align:left;border-bottom:1px solid var(--line);padding:9px 6px;vertical-align:top}.muted{color:var(--muted)}.succeeded{color:var(--ok)}.failed{color:var(--bad)}pre{white-space:pre-wrap;word-break:break-word;background:#0a1020;padding:12px;border-radius:7px}.hidden{display:none}@media(max-width:760px){.grid{grid-template-columns:1fr}}
</style></head><body><main><h1>Actions</h1><p class="muted">Create and run bounded, local operations. No shell or remote execution.</p>
<div class="grid"><section><div class="panel"><h2>Proof workflow</h2><p class="muted">Verify evidence, create a portable receipt, then export it locally from your browser.</p><form id="workflow"><label>Receipt label</label><input name="label" maxlength="80" required><label>Evidence JSON</label><textarea name="evidence_json" maxlength="65536" required></textarea><button>Run proof workflow</button></form><div id="workflow-history"></div></div><div class="panel"><h2>Create action</h2><form id="create"><label>Name</label><input name="name" maxlength="80" required><label>Operation</label><select name="operation" id="operation"></select><p id="description" class="muted"></p><button>Create</button></form></div>
<div class="panel"><h2>Actions index</h2><div id="actions">Loading…</div></div></section>
<section><div class="panel" id="detail"><h2>Select an action</h2><p class="muted">Choose an action to run it and inspect history.</p></div><div class="panel hidden" id="run-detail"></div></section></div></main>
<script type="module">
const q=(s)=>document.querySelector(s);let catalogue=[];let selected=null;
const csrf='__CSRF__';async function api(path,options={}){const response=await fetch(path,{...options,headers:options.body?{'content-type':'application/json','x-valley-csrf':csrf}:{}});const body=await response.json();if(!response.ok)throw new Error(body.error||'Request failed');return body}
function esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function download(name,text,type){const blob=new Blob([text],{type});const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(link.href),0)}
async function boot(){catalogue=(await api('/api/operations')).operations;q('#operation').innerHTML=catalogue.map(o=>'<option value="'+esc(o.id)+'">'+esc(o.label)+'</option>').join('');showDescription();await refreshActions();await refreshWorkflowHistory()}
function showDescription(){q('#description').textContent=catalogue.find(o=>o.id===q('#operation').value)?.description||''}q('#operation').addEventListener('change',showDescription);
q('#create').addEventListener('submit',async e=>{e.preventDefault();const data=new FormData(e.target);try{const action=await api('/api/actions',{method:'POST',body:JSON.stringify({name:data.get('name'),operation:data.get('operation')})});e.target.reset();showDescription();await refreshActions();await selectAction(action.id)}catch(err){alert(err.message)}});
async function refreshActions(){const data=await api('/api/actions');q('#actions').innerHTML=data.actions.length?'<table><tr><th>Name</th><th>Operation</th><th>Runs</th></tr>'+data.actions.map(a=>'<tr><td><a href="#" data-action="'+a.id+'">'+esc(a.name)+'</a></td><td>'+esc(a.operation)+'</td><td>'+a.run_count+'</td></tr>').join('')+'</table>':'<p class="muted">No actions yet.</p>';document.querySelectorAll('[data-action]').forEach(a=>a.onclick=e=>{e.preventDefault();selectAction(a.dataset.action)})}
async function selectAction(id){selected=await api('/api/actions/'+id);const fields=selected.input_fields.map(f=>'<label>'+esc(f.label)+' <span class="muted">(max '+f.max_length+')</span></label><textarea name="'+esc(f.name)+'" maxlength="'+f.max_length+'" required></textarea>').join('');const rows=selected.runs.length?'<table><tr><th>Status</th><th>Started</th><th>Duration</th><th></th></tr>'+selected.runs.map(r=>'<tr><td class="'+r.status+'">'+r.status+'</td><td>'+esc(r.started_at)+'</td><td>'+r.duration_ms+' ms</td><td><a href="#" data-run="'+r.id+'">inspect</a></td></tr>').join('')+'</table>':'<p class="muted">No runs yet.</p>';q('#detail').innerHTML='<h2>'+esc(selected.name)+'</h2><p><code>'+esc(selected.operation)+'</code></p><form id="run">'+fields+'<button>Run action</button></form><h3>Run history</h3>'+rows;q('#run').onsubmit=runSelected;document.querySelectorAll('[data-run]').forEach(a=>a.onclick=e=>{e.preventDefault();showRun(a.dataset.run)})}
async function runSelected(e){e.preventDefault();const data=new FormData(e.target);const inputs={};for(const field of selected.input_fields)inputs[field.name]=data.get(field.name);try{const run=await api('/api/actions/'+selected.id+'/runs',{method:'POST',body:JSON.stringify({inputs})});await refreshActions();await selectAction(selected.id);await showRun(run.id)}catch(err){alert(err.message)}}
async function refreshWorkflowHistory(){const data=await api('/api/workflow-runs');q('#workflow-history').innerHTML='<h3>Proof workflow history</h3>'+(data.runs.length?'<table><tr><th>Status</th><th>Started</th><th></th></tr>'+data.runs.map(r=>'<tr><td class="'+r.status+'">'+esc(r.status)+'</td><td>'+esc(r.started_at)+'</td><td><a href="#" data-workflow-run="'+r.id+'">inspect</a></td></tr>').join('')+'</table>':'<p class="muted">No proof workflows yet.</p>');document.querySelectorAll('[data-workflow-run]').forEach(a=>a.onclick=e=>{e.preventDefault();showWorkflowRun(a.dataset.workflowRun)})}
q('#workflow').addEventListener('submit',async e=>{e.preventDefault();const data=new FormData(e.target);try{const run=await api('/api/workflows/proof.receipt.v1/runs',{method:'POST',body:JSON.stringify({inputs:{label:data.get('label'),evidence_json:data.get('evidence_json')}})});await refreshWorkflowHistory();await showWorkflowRun(run.id)}catch(err){alert(err.message)}});
async function showWorkflowRun(id){const run=await api('/api/workflow-runs/'+id);const steps='<ol>'+run.steps.map(s=>'<li class="'+s.status+'"><strong>'+esc(s.label)+'</strong>: '+esc(s.status)+'<pre>'+esc(s.output||s.error||'(empty)')+'</pre></li>').join('')+'</ol>';const exports=run.receipt?'<button class="secondary" id="export-json">Export receipt JSON</button><button class="secondary" id="export-markdown">Export receipt Markdown</button>':'';const retry=run.status==='failed'?'<button class="secondary" id="retry-workflow">Re-run failed workflow</button>':'';q('#run-detail').classList.remove('hidden');q('#run-detail').innerHTML='<h2>Proof workflow run</h2><p>Status: <strong class="'+run.status+'">'+esc(run.status)+'</strong></p><p class="muted">Run '+esc(run.id)+(run.retry_of?' · retry of '+esc(run.retry_of):'')+'</p><h3>Steps</h3>'+steps+exports+retry;if(run.receipt){q('#export-json').onclick=()=>download('proof-receipt.json',run.receipt.json,'application/json');q('#export-markdown').onclick=()=>download('proof-receipt.md',run.receipt.markdown,'text/markdown')}if(run.status==='failed')q('#retry-workflow').onclick=async()=>{const next=await api('/api/workflow-runs/'+run.id+'/retry',{method:'POST',body:'{}'});await refreshWorkflowHistory();await showWorkflowRun(next.id)}}
async function showRun(id){const run=await api('/api/runs/'+id);const retry=run.status==='failed'?'<button class="secondary" id="retry">Retry failed run</button>':'';q('#run-detail').classList.remove('hidden');q('#run-detail').innerHTML='<h2>Run detail</h2><p>Status: <strong class="'+run.status+'">'+run.status+'</strong></p><p>Exit code: '+run.exit_code+' · Duration: '+run.duration_ms+' ms</p><p class="muted">Run '+esc(run.id)+(run.retry_of?' · retry of '+esc(run.retry_of):'')+'</p><h3>Inputs</h3><pre>'+esc(JSON.stringify(run.inputs,null,2))+'</pre><h3>Output</h3><pre>'+esc(run.output||'(empty)')+'</pre><h3>Error</h3><pre>'+esc(run.error||'(empty)')+'</pre>'+retry;if(run.status==='failed')q('#retry').onclick=async()=>{const next=await api('/api/runs/'+run.id+'/retry',{method:'POST',body:'{}'});await refreshActions();await selectAction(run.action_id);await showRun(next.id)}}
boot().catch(err=>{document.body.textContent=err.message});
</script></body></html>`;

function send(response, status, body, type = 'application/json; charset=utf-8') {
  response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'" });
  response.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

async function readJson(request) {
  if (request.headers['content-type'] !== 'application/json') throw new ActionsInputError('content-type must be application/json');
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > MAX_BODY_BYTES) throw new ActionsInputError('request exceeds 512 KiB'); chunks.push(chunk); }
  let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ActionsInputError('body must be valid JSON'); }
  return body;
}

export function createActionsServer(statePath) {
  if (!isAbsolute(statePath)) throw new ActionsInputError('state path must be absolute');
  const csrfToken = randomUUID();
  let queue = Promise.resolve();
  const mutate = (operation) => { const task = queue.then(() => withStateTransaction(statePath, operation)); queue = task.catch(() => {}); return task; };
  return createServer(async (request, response) => {
    try {
      const expectedHost = `127.0.0.1:${request.socket.localPort}`; const origin = `http://${expectedHost}`;
      if (request.headers.host !== expectedHost) return send(response, 400, { error: 'invalid host' });
      if (request.method === 'GET' && request.url === '/') return send(response, 200, HTML.replace('__CSRF__', csrfToken), 'text/html; charset=utf-8');
      if (request.method === 'GET' && request.url === '/api/operations') return send(response, 200, { operations: operationCatalogue() });
      if (request.method === 'GET' && request.url === '/api/workflows') return send(response, 200, { workflows: workflowCatalogue() });
      if (request.method === 'GET' && request.url === '/api/workflow-runs') return send(response, 200, { runs: listWorkflowRuns(loadState(statePath)) });
      if (request.method === 'GET' && request.url === '/api/actions') return send(response, 200, { actions: listActions(loadState(statePath)) });
      if (request.method === 'GET' && request.url === '/api/runs') return send(response, 200, { runs: listRuns(loadState(statePath)) });
      let match = /^\/api\/actions\/([0-9a-f-]+)$/u.exec(request.url ?? '');
      let workflowMatch = /^\/api\/workflows\/([a-z0-9.]+)$/u.exec(request.url ?? '');
      if (request.method === 'GET' && workflowMatch) return send(response, 200, getWorkflow(workflowMatch[1]));
      if (request.method === 'GET' && match) return send(response, 200, getAction(loadState(statePath), match[1]));
      if (request.method !== 'GET' && (request.headers.origin !== origin || request.headers['x-valley-csrf'] !== csrfToken)) return send(response, 403, { error: 'request protection rejected' });
      if (request.method === 'POST' && request.url === '/api/actions') { const body = await readJson(request); return send(response, 201, await mutate((state) => createAction(state, body))); }
      workflowMatch = /^\/api\/workflows\/([a-z0-9.]+)\/runs$/u.exec(request.url ?? '');
      if (request.method === 'POST' && workflowMatch) { const body = await readJson(request); return send(response, 201, await mutate((state) => runWorkflow(state, workflowMatch[1], body))); }
      match = /^\/api\/actions\/([0-9a-f-]+)\/runs$/u.exec(request.url ?? '');
      if (request.method === 'POST' && match) { const body = await readJson(request); return send(response, 201, await mutate((state) => runAction(state, match[1], body))); }
      match = /^\/api\/runs\/([0-9a-f-]+)$/u.exec(request.url ?? '');
      match = /^\/api\/workflow-runs\/([0-9a-f-]+)$/u.exec(request.url ?? '');
      if (request.method === 'GET' && match) return send(response, 200, getWorkflowRun(loadState(statePath), match[1]));
      match = /^\/api\/workflow-runs\/([0-9a-f-]+)\/retry$/u.exec(request.url ?? '');
      if (request.method === 'POST' && match) { await readJson(request); return send(response, 201, await mutate((state) => retryWorkflowRun(state, match[1]))); }
      match = /^\/api\/runs\/([0-9a-f-]+)$/u.exec(request.url ?? '');
      if (request.method === 'GET' && match) return send(response, 200, getRun(loadState(statePath), match[1]));
      match = /^\/api\/runs\/([0-9a-f-]+)\/retry$/u.exec(request.url ?? '');
      if (request.method === 'POST' && match) { await readJson(request); return send(response, 201, await mutate((state) => retryRun(state, match[1]))); }
      return send(response, 404, { error: 'not found' });
    } catch (error) {
      if (error instanceof ActionsNotFoundError) return send(response, 404, { error: error.message });
      if (error instanceof ActionsConflictError) return send(response, 409, { error: error.message });
      if (error instanceof ActionsInputError) return send(response, 400, { error: error.message });
      return send(response, 500, { error: 'internal failure' });
    }
  });
}

export async function runActionsServer(args, stdout, stderr) {
  if (!([2, 4].includes(args.length) && args[0] === '--state' && (args.length === 2 || args[2] === '--port'))) {
    stderr.write('usage: valley-actions --state /absolute/path/actions.json [--port 4173]\n'); return 2;
  }
  const port = args.length === 4 ? Number(args[3]) : 4173;
  if (!Number.isInteger(port) || port < 0 || port > 65535) { stderr.write('error: port must be 0-65535\n'); return 2; }
  try {
    const server = createActionsServer(args[1]);
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    const address = server.address(); stdout.write(`Valley Actions: http://127.0.0.1:${address.port}\nState: ${args[1]}\n`);
    return await new Promise((resolve) => { server.once('close', () => resolve(0)); });
  } catch (error) { stderr.write(`error: ${error instanceof ActionsInputError ? error.message : 'server failed'}\n`); return 1; }
}
