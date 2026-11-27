require('./env');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const BASE = 'https://bot.marizo.site/api/v1';
const KEY = process.env.N8N_API_KEY;
const NEW = process.env.TELEGRAM_BOT_TOKEN;
const OLD_CRED_ID = '8H0hBfrPobhcvfBu';
const TOKEN_IN_URL = /api\.telegram\.org\/bot\d{8,10}:AA[A-Za-z0-9_-]{30,}\//g;

function api(method, url, body) {
  let data = '';
  let tmp;
  if (body) {
    tmp = path.join(os.tmpdir(), `n8n_body_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
    fs.writeFileSync(tmp, JSON.stringify(body), { mode: 0o600 });
    data = `-H "Content-Type: application/json" --data-binary @${tmp}`;
  }
  try {
    const out = execSync(`curl -s -X ${method} "${BASE}${url}" -H "X-N8N-API-KEY: ${KEY}" ${data}`, { maxBuffer: 1 << 28 }).toString();
    const json = out ? JSON.parse(out) : {};
    if (json.message && !json.id && !json.data) throw new Error(`${method} ${url}: ${json.message}`);
    return json;
  } finally {
    if (tmp) fs.unlinkSync(tmp);
  }
}

const me = JSON.parse(execSync(`curl -s "https://api.telegram.org/bot${NEW}/getMe"`).toString());
if (!me.ok) throw new Error('New token rejected by Telegram getMe: ' + me.description);
console.log('New token valid for bot @' + me.result.username);

const cred = api('POST', '/credentials', {
  name: 'Telegram account', type: 'telegramApi',
  data: { accessToken: NEW, baseUrl: 'https://api.telegram.org' }
});
console.log('Created credential', cred.id);

for (const { id } of api('GET', '/workflows?limit=250').data) {
  const wf = api('GET', `/workflows/${id}`);
  let urls = 0, creds = 0;
  for (const node of wf.nodes) {
    const p = node.parameters || {};
    if (typeof p.url === 'string') {
      const swapped = p.url.replace(TOKEN_IN_URL, `api.telegram.org/bot${NEW}/`);
      if (swapped !== p.url) { p.url = swapped; urls++; }
    }
    if (node.credentials && node.credentials.telegramApi && node.credentials.telegramApi.id === OLD_CRED_ID) {
      node.credentials.telegramApi = { id: cred.id, name: cred.name };
      creds++;
    }
  }
  if (!urls && !creds) continue;
  if (wf.active) api('POST', `/workflows/${id}/deactivate`);
  api('PUT', `/workflows/${id}`, { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings });
  const act = wf.active ? api('POST', `/workflows/${id}/activate`).active : false;
  console.log(`${wf.name}: ${urls} URLs, ${creds} credential refs updated | active: ${act}`);
}

api('DELETE', `/credentials/${OLD_CRED_ID}`);
console.log('Deleted old credential', OLD_CRED_ID);

const hook = JSON.parse(execSync(`curl -s "https://api.telegram.org/bot${NEW}/getWebhookInfo"`).toString()).result;
console.log('Webhook host:', new URL(hook.url).host, '| pending:', hook.pending_update_count, '| last error:', hook.last_error_message || 'none');
