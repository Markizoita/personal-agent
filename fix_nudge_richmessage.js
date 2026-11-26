require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_latest8.json`);

const d = JSON.parse(fs.readFileSync('workflow_latest8.json', 'utf8'));
const SB_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const idx = d.nodes.findIndex(n => n.name === 'Send Wake Nudge');
const pos = d.nodes[idx].position;
const id = d.nodes[idx].id;
d.nodes[idx] = {
  parameters: {
    method: 'POST',
    url: 'https://api.telegram.org/bot' + SB_TOKEN + '/sendRichMessage',
    sendHeaders: true,
    headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ chat_id: '" + CHAT_ID + "', rich_message: { markdown: \"*Still waiting on today's read.*\" } }) }}",
    options: {}
  },
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: pos,
  id,
  name: 'Send Wake Nudge',
  retryOnFail: true,
  maxTries: 3,
  waitBetweenTries: 2000
};

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_dailyform6.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
