// Creates an "Error Watcher" workflow (Error Trigger -> Telegram alert) and
// sets it as the main bot workflow's error workflow, so any failed execution
// sends Mark a Telegram message instead of failing silently.
// Safe to re-run: reuses the existing Error Watcher if one is already there.
require('./env');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const BASE = 'https://bot.marizo.site/api/v1';
const KEY = process.env.N8N_API_KEY;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const MAIN_ID = 'lULFqqQFMNb8byt2';
const WATCHER_NAME = 'Error Watcher';
if (!KEY || !CHAT_ID) throw new Error('N8N_API_KEY and TELEGRAM_CHAT_ID must be set in .env');

function api(method, url, body) {
  let data = '';
  if (body) {
    const tmp = path.join(os.tmpdir(), `n8n_body_${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify(body));
    data = `-H "Content-Type: application/json" --data-binary @${tmp}`;
  }
  const out = execSync(`curl -s -X ${method} "${BASE}${url}" -H "X-N8N-API-KEY: ${KEY}" ${data}`).toString();
  const json = JSON.parse(out);
  if (json.message && !json.id && !json.data) throw new Error(`${method} ${url}: ${json.message}`);
  return json;
}

// Plain text (no parse mode) so error messages with * _ [ ] can't break formatting.
const alertText =
  "={{ '⚠️ Bot error in \"' + ($json.workflow?.name || 'workflow') + '\"\\n\\n'" +
  " + 'Step: ' + ($json.execution?.lastNodeExecuted || $json.trigger?.error?.node?.name || 'unknown') + '\\n'" +
  " + 'Error: ' + String($json.execution?.error?.message || $json.trigger?.error?.message || 'unknown error').slice(0, 800) + '\\n'" +
  " + 'Mode: ' + ($json.execution?.mode || $json.trigger?.mode || 'n/a') + '\\n'" +
  " + ($json.execution?.url ? ('\\nOpen run: ' + $json.execution.url) : '') }}";

const watcher = {
  name: WATCHER_NAME,
  nodes: [
    {
      id: 'e7a1c0de-0001-4000-8000-000000000001',
      name: 'Error Trigger',
      type: 'n8n-nodes-base.errorTrigger',
      typeVersion: 1,
      position: [0, 0],
      parameters: {}
    },
    {
      id: 'e7a1c0de-0002-4000-8000-000000000002',
      name: 'Send Error Alert',
      type: 'n8n-nodes-base.telegram',
      typeVersion: 1.2,
      position: [240, 0],
      parameters: {
        chatId: CHAT_ID,
        text: alertText,
        additionalFields: { appendAttribution: false }
      },
      credentials: { telegramApi: { id: '8H0hBfrPobhcvfBu', name: 'Telegram account' } }
    }
  ],
  connections: {
    'Error Trigger': { main: [[{ node: 'Send Error Alert', type: 'main', index: 0 }]] }
  },
  settings: { executionOrder: 'v1' }
};

// 1. Create or update the Error Watcher workflow.
const existing = api('GET', '/workflows?limit=250').data.find(w => w.name === WATCHER_NAME);
const saved = existing
  ? api('PUT', `/workflows/${existing.id}`, watcher)
  : api('POST', '/workflows', watcher);
console.log(`${existing ? 'Updated' : 'Created'} ${WATCHER_NAME}: ${saved.id}`);
// n8n refuses to link an error workflow that has no published version.
const published = api('POST', `/workflows/${saved.id}/activate`);
console.log(`Published ${WATCHER_NAME}: active =`, published.active);

// 2. Point the main workflow's settings.errorWorkflow at it.
const main = api('GET', `/workflows/${MAIN_ID}`);
fs.writeFileSync('workflow_before_errorwatcher.json', JSON.stringify(main, null, 2));
const updated = api('PUT', `/workflows/${MAIN_ID}`, {
  name: main.name,
  nodes: main.nodes,
  connections: main.connections,
  settings: { ...main.settings, errorWorkflow: saved.id }
});
console.log('Main workflow errorWorkflow =', updated.settings.errorWorkflow, '| active =', updated.active);
