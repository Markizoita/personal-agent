// Read-only endpoint for the Windows app's game screen (game/the-climb.html):
//   GET https://bot.marizo.site/webhook/game-state  with header X-Game-Token: <GAME_API_TOKEN>
//   (or ?token=<GAME_API_TOKEN>). Returns get_game_state() as JSON. Wrong/missing token -> 401.
// Separate "Game State API" workflow so it can't affect the bot. Safe to re-run.
require('./env');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const BASE = 'https://bot.marizo.site/api/v1';
const KEY = process.env.N8N_API_KEY;
const TOKEN = process.env.GAME_API_TOKEN;
const MAIN_ID = 'lULFqqQFMNb8byt2';
const NAME = 'Game State API';
if (!TOKEN) throw new Error('GAME_API_TOKEN must be set in .env');

function api(method, url, body) {
  let data = '';
  if (body) {
    const tmp = path.join(os.tmpdir(), `n8n_body_${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify(body), { mode: 0o600 });
    data = `-H "Content-Type: application/json" --data-binary @${tmp}`;
  }
  const json = JSON.parse(execSync(`curl -s -X ${method} "${BASE}${url}" -H "X-N8N-API-KEY: ${KEY}" ${data}`).toString());
  if (json.message && !json.id && !json.data) throw new Error(`${method} ${url}: ${json.message}`);
  return json;
}

// Reuse the Supabase URL + key already in the bot workflow (nothing secret in the repo).
const main = api('GET', `/workflows/${MAIN_ID}`);
const sbNode = main.nodes.find(n => n.name === 'Log Pending Purchase');
const sbUrl = sbNode.parameters.url.replace(/\/rest\/v1\/.*/, '');
const sbHeaders = sbNode.parameters.headerParameters.parameters.filter(h => h.name !== 'Prefer');

const cors = { entries: [
  { name: 'Access-Control-Allow-Origin', value: '*' },
  { name: 'Cache-Control', value: 'no-store' }
] };

const wf = {
  name: NAME,
  nodes: [
    { id: 'gapi0001', name: 'Game State Webhook', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0],
      webhookId: 'game-state', parameters: { path: 'game-state', httpMethod: 'GET', responseMode: 'responseNode', options: { allowedOrigins: '*' } } },
    { id: 'gapi0002', name: 'Token OK?', type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [220, 0],
      parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 1 },
        conditions: [{ id: 'tok', leftValue: "={{ $json.headers['x-game-token'] || $json.query.token || '' }}", rightValue: TOKEN,
          operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, options: {} } },
    { id: 'gapi0003', name: 'Get Game State', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [440, -100],
      parameters: { method: 'POST', url: `${sbUrl}/rest/v1/rpc/get_game_state`, sendHeaders: true,
        headerParameters: { parameters: [...sbHeaders] }, sendBody: true, specifyBody: 'json', jsonBody: '{}', options: {} } },
    { id: 'gapi0004', name: 'Respond State', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [660, -100],
      parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify($json) }}', options: { responseHeaders: cors } } },
    { id: 'gapi0005', name: 'Respond 401', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [440, 100],
      parameters: { respondWith: 'json', responseBody: '{"error":"unauthorized"}', options: { responseCode: 401, responseHeaders: cors } } }
  ],
  connections: {
    'Game State Webhook': { main: [[{ node: 'Token OK?', type: 'main', index: 0 }]] },
    'Token OK?': { main: [[{ node: 'Get Game State', type: 'main', index: 0 }], [{ node: 'Respond 401', type: 'main', index: 0 }]] },
    'Get Game State': { main: [[{ node: 'Respond State', type: 'main', index: 0 }]] }
  },
  settings: { executionOrder: 'v1', errorWorkflow: main.settings.errorWorkflow }
};

const existing = api('GET', '/workflows?limit=250').data.find(w => w.name === NAME);
if (existing && existing.active) api('POST', `/workflows/${existing.id}/deactivate`);
const saved = existing ? api('PUT', `/workflows/${existing.id}`, wf) : api('POST', '/workflows', wf);
const act = api('POST', `/workflows/${saved.id}/activate`);
console.log(`${existing ? 'Updated' : 'Created'} ${NAME}: ${saved.id} | active: ${act.active}`);
