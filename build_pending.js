require('./env');
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('workflow_v6.json', 'utf8'));
const newSystemMessage = fs.readFileSync('system_message5.txt', 'utf8');

const SUPABASE_URL = 'https://hzwmypoifzazhekzbpos.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

// Update system prompt
const agent = d.nodes.find(n => n.name === 'AI Agent');
agent.parameters.options.systemMessage = newSystemMessage;

// New deterministic node: log a pending row the instant the webhook fires
const logPending = {
  parameters: {
    method: 'POST',
    url: SUPABASE_URL + '/rest/v1/spending',
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: 'apikey', value: SB_KEY },
        { name: 'Authorization', value: 'Bearer ' + SB_KEY },
        { name: 'Content-Type', value: 'application/json' },
        { name: 'Prefer', value: 'return=minimal' }
      ]
    },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ amount: Number($json.body.amount), merchant: $json.body.merchant || 'Unknown', category: 'pending', confirmed: false, raw_message: 'Apple Pay auto-detected, awaiting confirmation' }) }}",
    options: {}
  },
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [48, 320],
  id: 'c1d2e3f4-0001-4000-8000-000000000001',
  name: 'Log Pending Purchase'
};

// Rewire: Apple Pay Webhook -> Log Pending Purchase -> Ask what it was
d.connections['Apple Pay Webhook'] = { main: [[{ node: 'Log Pending Purchase', type: 'main', index: 0 }]] };
d.connections['Log Pending Purchase'] = { main: [[{ node: 'Ask what it was', type: 'main', index: 0 }]] };

// Reposition "Ask what it was" node a bit to the right of the new node
const askNode = d.nodes.find(n => n.name === 'Ask what it was');
askNode.position = [240, 320];

// New agent tools
const getPending = {
  parameters: {
    toolDescription: "Checks for an unconfirmed Apple Pay purchase (amount known, item not yet described). Always call this FIRST before logging any spending or daily-log update, to see if the current message might be answering what a recent auto-detected purchase was.",
    method: 'GET',
    url: SUPABASE_URL + '/rest/v1/spending?confirmed=eq.false&order=created_at.desc&limit=1',
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: 'apikey', value: SB_KEY },
        { name: 'Authorization', value: 'Bearer ' + SB_KEY }
      ]
    },
    options: {}
  },
  type: 'n8n-nodes-base.httpRequestTool',
  typeVersion: 4.5,
  position: [624, 144],
  id: 'c1d2e3f4-0002-4000-8000-000000000002',
  name: 'get_pending_purchase'
};

const confirmPending = {
  parameters: {
    toolDescription: "Completes a pending Apple-Pay-detected purchase once you know what it was. Pass the id from get_pending_purchase, plus the merchant/item and category. Do NOT pass amount - it's already logged.",
    method: 'PATCH',
    url: "={{ 'https://hzwmypoifzazhekzbpos.supabase.co/rest/v1/spending?id=eq.' + $fromAI('id', 'the id of the pending purchase row from get_pending_purchase', 'number') }}",
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: 'apikey', value: SB_KEY },
        { name: 'Authorization', value: 'Bearer ' + SB_KEY },
        { name: 'Content-Type', value: 'application/json' },
        { name: 'Prefer', value: 'return=minimal' }
      ]
    },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: "={\n  \"merchant\": \"{{ $fromAI('merchant', 'where the purchase was made or what it was', 'string') }}\",\n  \"category\": \"{{ $fromAI('category', 'spending category like essentials, non-essentials, or business', 'string') }}\",\n  \"confirmed\": true\n}",
    options: {}
  },
  type: 'n8n-nodes-base.httpRequestTool',
  typeVersion: 4.5,
  position: [720, 144],
  id: 'c1d2e3f4-0003-4000-8000-000000000003',
  name: 'confirm_pending_purchase'
};

d.nodes.push(logPending, getPending, confirmPending);
d.connections['get_pending_purchase'] = { ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]] };
d.connections['confirm_pending_purchase'] = { ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]] };

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow7.json', JSON.stringify(payload));
console.log('built, nodeCount:', payload.nodes.length);
console.log(payload.nodes.map(n => n.name).join(', '));
