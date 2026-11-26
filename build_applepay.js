require('./env');
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('workflow_v5.json', 'utf8'));

// Remove the web-chat-only nodes
const removeNames = ['Webhook', 'AI Agent (Web)', 'Anthropic Chat Model (Web)', 'Respond to Webhook'];
d.nodes = d.nodes.filter(n => !removeNames.includes(n.name));
for (const name of removeNames) delete d.connections[name];
for (const toolName of ['log_purchases', 'get_today_total', 'get_recent_logs', 'update_daily_log']) {
  d.connections[toolName].ai_tool[0] = d.connections[toolName].ai_tool[0].filter(c => c.node !== 'AI Agent (Web)');
}

const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const applePayWebhook = {
  parameters: {
    httpMethod: 'POST',
    path: 'apple-pay',
    authentication: 'headerAuth',
    responseMode: 'onReceived',
    options: {}
  },
  type: 'n8n-nodes-base.webhook',
  typeVersion: 2,
  position: [-96, 320],
  id: 'b1c2d3e4-0001-4000-8000-000000000001',
  name: 'Apple Pay Webhook',
  webhookId: 'b1c2d3e4-0001-4000-8000-000000000001',
  credentials: {
    httpHeaderAuth: { id: 'pB7Lt8cTKzQTNFnf', name: 'Web chat auth' }
  }
};

const askWhatItWas = {
  parameters: {
    chatId: TELEGRAM_CHAT_ID,
    text: "={{ 'Noticed a purchase' + ($json.body.amount ? (' of $' + $json.body.amount) : '') + ($json.body.merchant ? (' at ' + $json.body.merchant) : '') + ' — what was it?' }}",
    additionalFields: {}
  },
  type: 'n8n-nodes-base.telegram',
  typeVersion: 1.2,
  position: [160, 320],
  id: 'b1c2d3e4-0002-4000-8000-000000000002',
  name: 'Ask what it was',
  credentials: {
    telegramApi: { id: '8H0hBfrPobhcvfBu', name: 'Telegram account' }
  }
};

d.nodes.push(applePayWebhook, askWhatItWas);
d.connections['Apple Pay Webhook'] = { main: [[{ node: 'Ask what it was', type: 'main', index: 0 }]] };

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow6.json', JSON.stringify(payload));
console.log('built, nodeCount:', payload.nodes.length);
console.log('node names:', payload.nodes.map(n => n.name).join(', '));
