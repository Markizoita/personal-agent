require('./env');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const BASE = 'https://bot.marizo.site/api/v1';
const KEY = process.env.N8N_API_KEY;
const MAIN_ID = 'lULFqqQFMNb8byt2';
const NAME = 'Dashboard Page';

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

const main = api('GET', `/workflows/${MAIN_ID}`);
const html = fs.readFileSync('dashboard.html', 'utf8');

const manifest = JSON.stringify({
  name: 'Start Up Ops', short_name: 'Start Up', start_url: '/webhook/dashboard',
  display: 'standalone', background_color: '#F6F6F3', theme_color: '#F6F6F3',
  icons: []
});

const wf = {
  name: NAME,
  nodes: [
    { id: 'dp01', name: 'Page Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0],
      webhookId: 'dp01', parameters: { httpMethod: 'GET', path: 'dashboard', responseMode: 'responseNode', options: {} } },
    { id: 'dp02', name: 'Respond Page', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [220, 0],
      parameters: { respondWith: 'text', responseBody: html, options: { responseHeaders: { entries: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }] } } } },
    { id: 'dp03', name: 'Manifest Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 160],
      webhookId: 'dp03', parameters: { httpMethod: 'GET', path: 'dashboard-manifest', responseMode: 'responseNode', options: {} } },
    { id: 'dp04', name: 'Respond Manifest', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [220, 160],
      parameters: { respondWith: 'text', responseBody: manifest, options: { responseHeaders: { entries: [{ name: 'Content-Type', value: 'application/manifest+json' }] } } } }
  ],
  connections: {
    'Page Webhook': { main: [[{ node: 'Respond Page', type: 'main', index: 0 }]] },
    'Manifest Webhook': { main: [[{ node: 'Respond Manifest', type: 'main', index: 0 }]] }
  },
  settings: { executionOrder: 'v1', errorWorkflow: main.settings.errorWorkflow }
};

const existing = api('GET', '/workflows?limit=250').data.find(w => w.name === NAME);
if (existing && existing.active) api('POST', `/workflows/${existing.id}/deactivate`);
const saved = existing ? api('PUT', `/workflows/${existing.id}`, wf) : api('POST', '/workflows', wf);
const act = api('POST', `/workflows/${saved.id}/activate`);
console.log(`${existing ? 'Updated' : 'Created'} ${NAME}: ${saved.id} | active: ${act.active} | html bytes: ${html.length}`);
