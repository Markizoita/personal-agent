require('./env');
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('workflow_v13.json', 'utf8'));

const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Fix the fragile dynamic chat-id reference so this node works regardless of trigger source
const sendNode = d.nodes.find(n => n.name === 'Send a text message');
sendNode.parameters.chatId = CHAT_ID;

const chatWebhook = {
  parameters: {
    httpMethod: 'POST',
    path: 'chat',
    authentication: 'headerAuth',
    responseMode: 'responseNode',
    options: {}
  },
  type: 'n8n-nodes-base.webhook',
  typeVersion: 2,
  position: [-96, -192],
  id: 'a9b8c7d6-0001-4000-8000-000000000001',
  name: 'Chat Webhook',
  webhookId: 'a9b8c7d6-0001-4000-8000-000000000001',
  credentials: {
    httpHeaderAuth: { id: 'pB7Lt8cTKzQTNFnf', name: 'Web chat auth' }
  }
};

const respondWebhook = {
  parameters: {
    respondWith: 'text',
    responseBody: '={{ $json.output }}',
    options: {}
  },
  type: 'n8n-nodes-base.respondToWebhook',
  typeVersion: 1.1,
  position: [320, -192],
  id: 'a9b8c7d6-0002-4000-8000-000000000002',
  name: 'Respond to Chat'
};

d.nodes.push(chatWebhook, respondWebhook);

// Chat Webhook feeds the SAME agent as Telegram does (fan-in)
d.connections['Chat Webhook'] = { main: [[{ node: 'AI Agent', type: 'main', index: 0 }]] };

// AI Agent's output now fans out to both Telegram and the webhook responder
d.connections['AI Agent'].main[0].push({ node: 'Respond to Chat', type: 'main', index: 0 });

// The agent reads the incoming text differently depending on source - make it source-aware
const agent = d.nodes.find(n => n.name === 'AI Agent');
agent.parameters.text = "={{ $json.message ? $json.message.text : $json.body.message }}";

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow15.json', JSON.stringify(payload));
console.log('built, nodeCount:', payload.nodes.length);
