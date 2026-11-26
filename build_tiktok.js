require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_tiktok1.json`);

const d = JSON.parse(fs.readFileSync('workflow_tiktok1.json', 'utf8'));
const SB_URL = 'https://hzwmypoifzazhekzbpos.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

function sbHeaders(extra) {
  return { parameters: [
    { name: 'apikey', value: SB_KEY },
    { name: 'Authorization', value: 'Bearer ' + SB_KEY },
    ...(extra || [])
  ] };
}

// ---------- Webhook ingestion (silent, no agent) ----------
const tiktokWebhook = {
  parameters: {
    httpMethod: 'POST',
    path: 'tiktok-event',
    authentication: 'headerAuth',
    options: {}
  },
  type: 'n8n-nodes-base.webhook',
  typeVersion: 2,
  position: [-96, 2850],
  id: 'tt000001-0001-4000-8000-000000000001',
  name: 'TikTok Webhook',
  webhookId: 'tt000001-0001-4000-8000-000000000001',
  credentials: { httpHeaderAuth: { id: 'pB7Lt8cTKzQTNFnf', name: 'Web chat auth' } }
};

const isOpenEvent = {
  parameters: {
    conditions: {
      options: { caseSensitive: false, leftValue: '', typeValidation: 'strict', version: 1 },
      conditions: [
        {
          id: 'cond1',
          leftValue: "={{ $json.body.event === 'open' ? 1 : 0 }}",
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
  position: [96, 2850],
  id: 'tt000001-0001-4000-8000-000000000002',
  name: 'Is Open Event?'
};

const logOpen = {
  parameters: {
    method: 'POST',
    url: SB_URL + '/rest/v1/rpc/log_tiktok_open',
    sendHeaders: true,
    headerParameters: sbHeaders([{ name: 'Content-Type', value: 'application/json' }]),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '{}',
    options: {}
  },
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [288, 2800],
  id: 'tt000001-0001-4000-8000-000000000003',
  name: 'Log TikTok Open',
  retryOnFail: true,
  maxTries: 3,
  waitBetweenTries: 2000
};

const logClose = {
  parameters: {
    method: 'POST',
    url: SB_URL + '/rest/v1/rpc/log_tiktok_close',
    sendHeaders: true,
    headerParameters: sbHeaders([{ name: 'Content-Type', value: 'application/json' }]),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '{}',
    options: {}
  },
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [288, 2900],
  id: 'tt000001-0001-4000-8000-000000000004',
  name: 'Log TikTok Close',
  retryOnFail: true,
  maxTries: 3,
  waitBetweenTries: 2000
};

d.nodes.push(tiktokWebhook, isOpenEvent, logOpen, logClose);
d.connections['TikTok Webhook'] = { main: [[{ node: 'Is Open Event?', type: 'main', index: 0 }]] };
d.connections['Is Open Event?'] = {
  main: [
    [{ node: 'Log TikTok Open', type: 'main', index: 0 }],
    [{ node: 'Log TikTok Close', type: 'main', index: 0 }]
  ]
};

// ---------- Agent tool for /tiktok ----------
const getTiktokWeekTool = {
  parameters: {
    toolDescription: "Gets the last 7 days of TikTok minutes tracked. Call this for '/tiktok'.",
    method: 'POST',
    url: SB_URL + '/rest/v1/rpc/get_tiktok_week',
    sendHeaders: true,
    headerParameters: sbHeaders([{ name: 'Content-Type', value: 'application/json' }]),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '{}',
    options: {}
  },
  type: 'n8n-nodes-base.httpRequestTool',
  typeVersion: 4.5,
  position: [4528, 144],
  id: 'tt000002-0001-4000-8000-000000000001',
  name: 'get_tiktok_week'
};

d.nodes.push(getTiktokWeekTool);
d.connections['get_tiktok_week'] = { ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]] };

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_tiktok1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
