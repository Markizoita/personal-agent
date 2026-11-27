require('./env');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const BASE = 'https://bot.marizo.site/api/v1';
const KEY = process.env.N8N_API_KEY;
const MAIN_ID = 'lULFqqQFMNb8byt2';
const NAME = 'Dashboard Actions API';
const SB_CRED = { id: 'yb7sQD3grJ7b2cYJ', name: 'Supabase service role' };

function api(method, url, body) {
  let data = '';
  if (body) {
    const tmp = path.join(os.tmpdir(), `n8n_body_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
    fs.writeFileSync(tmp, JSON.stringify(body), { mode: 0o600 });
    data = `-H "Content-Type: application/json" --data-binary @${tmp}`;
  }
  const json = JSON.parse(execSync(`curl -s -X ${method} "${BASE}${url}" -H "X-N8N-API-KEY: ${KEY}" ${data}`).toString());
  if (json.message && !json.id && !json.data) throw new Error(`${method} ${url}: ${json.message}`);
  return json;
}

// Fetch main workflow once, just to inherit the shared error workflow setting.
const main = api('GET', `/workflows/${MAIN_ID}`);
const SB_URL = 'https://hzwmypoifzazhekzbpos.supabase.co';

const cors = { entries: [
  { name: 'Access-Control-Allow-Origin', value: '*' },
  { name: 'Access-Control-Allow-Headers', value: 'Content-Type' },
  { name: 'Cache-Control', value: 'no-store' }
] };

function supabaseCallNode(id, name, pos, rpc, bodyExpr) {
  return {
    id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos,
    retryOnFail: true, maxTries: 2, waitBetweenTries: 1000,
    parameters: {
      method: 'POST', url: `${SB_URL}/rest/v1/rpc/${rpc}`,
      authentication: 'predefinedCredentialType', nodeCredentialType: 'supabaseApi',
      sendHeaders: true, headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] },
      sendBody: true, specifyBody: 'json', jsonBody: bodyExpr, options: {}
    },
    credentials: { supabaseApi: SB_CRED }
  };
}
function respondNode(id, name, pos) {
  return {
    id, name, type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: pos,
    parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: { responseHeaders: cors } }
  };
}
function webhookNode(id, name, pos, p) {
  return {
    id, name, type: 'n8n-nodes-base.webhook', typeVersion: 2, position: pos, webhookId: id,
    parameters: { httpMethod: 'POST', path: p, responseMode: 'responseNode', options: { allowedOrigins: '*' } }
  };
}

// One endpoint = Webhook -> call the dashboard_* RPC (token + its own params from the body) -> Respond.
// Every dashboard_* function always returns valid JSON (ok:true/false), so no separate error branch needed.
const ENDPOINTS = [
  { path: 'dashboard-login', rpc: 'dashboard_login',
    body: "={{ JSON.stringify({ p_password: $json.body.password }) }}" },
  { path: 'dashboard-start', rpc: 'dashboard_start',
    body: "={{ JSON.stringify({ p_token: $json.body.token, p_project: $json.body.project || null }) }}" },
  { path: 'dashboard-stop', rpc: 'dashboard_stop',
    body: "={{ JSON.stringify({ p_token: $json.body.token }) }}" },
  { path: 'dashboard-submit-day', rpc: 'dashboard_submit_day',
    body: "={{ JSON.stringify({ p_token: $json.body.token, p_off_reason: $json.body.off_reason || null }) }}" },
  { path: 'dashboard-add-todo', rpc: 'dashboard_add_todo',
    body: "={{ JSON.stringify({ p_token: $json.body.token, p_project: $json.body.project, p_text: $json.body.text, p_day: $json.body.day || 'today', p_tag: $json.body.tag || 'new' }) }}" },
  { path: 'dashboard-todo-done', rpc: 'dashboard_todo_done',
    body: "={{ JSON.stringify({ p_token: $json.body.token, p_id: String($json.body.id), p_done: String($json.body.done !== undefined ? $json.body.done : true) }) }}" },
  { path: 'dashboard-todo-delete', rpc: 'dashboard_todo_delete',
    body: "={{ JSON.stringify({ p_token: $json.body.token, p_id: String($json.body.id) }) }}" },
  { path: 'dashboard-log-proof', rpc: 'dashboard_log_proof',
    body: "={{ JSON.stringify({ p_token: $json.body.token, p_text: $json.body.text, p_project: $json.body.project || null }) }}" },
  { path: 'dashboard-log-task', rpc: 'dashboard_log_task',
    body: "={{ JSON.stringify({ p_token: $json.body.token, p_task: $json.body.task, p_quantity: $json.body.quantity != null ? String($json.body.quantity) : null, p_note: $json.body.note || null, p_project: $json.body.project || null }) }}" },
  { path: 'dashboard-undo-task', rpc: 'dashboard_undo_task',
    body: "={{ JSON.stringify({ p_token: $json.body.token, p_id: String($json.body.id) }) }}" },
  { path: 'dashboard-set-project', rpc: 'dashboard_set_project',
    body: "={{ JSON.stringify({ p_token: $json.body.token, p_name: $json.body.name, p_status: $json.body.status || 'Building' }) }}" },
  { path: 'dashboard-home', rpc: 'dashboard_get_home',
    body: "={{ JSON.stringify({ p_token: $json.body.token }) }}" },
  { path: 'dashboard-progress', rpc: 'dashboard_get_progress',
    body: "={{ JSON.stringify({ p_token: $json.body.token, p_period: $json.body.period || 'week' }) }}" },
  { path: 'dashboard-projects', rpc: 'dashboard_get_projects',
    body: "={{ JSON.stringify({ p_token: $json.body.token }) }}" },
  { path: 'dashboard-history', rpc: 'dashboard_get_history',
    body: "={{ JSON.stringify({ p_token: $json.body.token, p_days: $json.body.days || '30' }) }}" },
  { path: 'dashboard-day', rpc: 'dashboard_get_day',
    body: "={{ JSON.stringify({ p_token: $json.body.token, p_date: $json.body.date || null }) }}" }
];

const nodes = [];
const connections = {};
ENDPOINTS.forEach((e, i) => {
  const y = i * 140;
  const wId = `dbh${i}`, cId = `dbc${i}`, rId = `dbr${i}`;
  const wName = 'Webhook: ' + e.path;
  const cName = 'Call ' + e.rpc;
  const rName = 'Respond: ' + e.path;
  nodes.push(webhookNode(wId, wName, [0, y], e.path));
  nodes.push(supabaseCallNode(cId, cName, [220, y], e.rpc, e.body));
  nodes.push(respondNode(rId, rName, [440, y]));
  connections[wName] = { main: [[{ node: cName, type: 'main', index: 0 }]] };
  connections[cName] = { main: [[{ node: rName, type: 'main', index: 0 }]] };
});

const wf = {
  name: NAME,
  nodes,
  connections,
  settings: { executionOrder: 'v1', errorWorkflow: main.settings.errorWorkflow }
};

const existing = api('GET', '/workflows?limit=250').data.find(w => w.name === NAME);
if (existing && existing.active) api('POST', `/workflows/${existing.id}/deactivate`);
const saved = existing ? api('PUT', `/workflows/${existing.id}`, wf) : api('POST', '/workflows', wf);
const act = api('POST', `/workflows/${saved.id}/activate`);
console.log(`${existing ? 'Updated' : 'Created'} ${NAME}: ${saved.id} | active: ${act.active} | nodes: ${nodes.length}`);
