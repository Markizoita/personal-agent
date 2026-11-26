require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_ttnudge1.json`);

const d = JSON.parse(fs.readFileSync('workflow_ttnudge1.json', 'utf8'));
const SB_URL = 'https://hzwmypoifzazhekzbpos.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const SB_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

function sbHeaders(extra) {
  return { parameters: [
    { name: 'apikey', value: SB_KEY },
    { name: 'Authorization', value: 'Bearer ' + SB_KEY },
    ...(extra || [])
  ] };
}

const checkTiktokElapsed = {
  parameters: {
    method: 'POST',
    url: SB_URL + '/rest/v1/rpc/get_tiktok_open_session_elapsed',
    sendHeaders: true,
    headerParameters: sbHeaders([{ name: 'Content-Type', value: 'application/json' }]),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '{}',
    options: {}
  },
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [288, 2750],
  id: 'tn000001-0001-4000-8000-000000000001',
  name: 'Check TikTok Elapsed',
  retryOnFail: true,
  maxTries: 3,
  waitBetweenTries: 2000
};

const isTiktokDue = {
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 1 },
      conditions: [
        {
          id: 'cond1',
          leftValue: '={{ $json.due ? 1 : 0 }}',
          rightValue: '={{ 1 }}',
          operator: { type: 'number', operation: 'equals' }
        }
      ],
      combinator: 'and'
    },
    options: {}
  },
  type: 'n8n-nodes-base.if',
  typeVersion: 2.2,
  position: [480, 2750],
  id: 'tn000001-0001-4000-8000-000000000002',
  name: 'Is TikTok Nudge Due?'
};

const formatTiktokNudge = {
  parameters: {
    jsCode: `const m = $json.minutes;
const h = Math.floor(m / 60);
const mm = m % 60;
const label = h > 0 ? (h + 'h ' + mm + 'm') : (mm + 'm');
return [{ json: { text: 'TikTok: ' + label + ' straight so far' } }];`
  },
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [672, 2700],
  id: 'tn000001-0001-4000-8000-000000000003',
  name: 'Format TikTok Nudge'
};

const sendTiktokNudge = {
  parameters: {
    method: 'POST',
    url: 'https://api.telegram.org/bot' + SB_TOKEN + '/sendRichMessage',
    sendHeaders: true,
    headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ chat_id: '" + CHAT_ID + "', rich_message: { markdown: $json.text } }) }}",
    options: {}
  },
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [864, 2700],
  id: 'tn000001-0001-4000-8000-000000000004',
  name: 'Send TikTok Nudge',
  retryOnFail: true,
  maxTries: 3,
  waitBetweenTries: 2000
};

d.nodes.push(checkTiktokElapsed, isTiktokDue, formatTiktokNudge, sendTiktokNudge);

// Reuse the existing 5-min "Schedule Poll" trigger - fan out to this new branch too
const existing = d.connections['Schedule Poll'].main[0];
d.connections['Schedule Poll'] = { main: [[...existing, { node: 'Check TikTok Elapsed', type: 'main', index: 0 }]] };
d.connections['Check TikTok Elapsed'] = { main: [[{ node: 'Is TikTok Nudge Due?', type: 'main', index: 0 }]] };
d.connections['Is TikTok Nudge Due?'] = { main: [[{ node: 'Format TikTok Nudge', type: 'main', index: 0 }], []] };
d.connections['Format TikTok Nudge'] = { main: [[{ node: 'Send TikTok Nudge', type: 'main', index: 0 }]] };

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_ttnudge1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
