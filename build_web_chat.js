const fs = require('fs');

const d = JSON.parse(fs.readFileSync('workflow_v3.json', 'utf8'));
const systemMessage = fs.readFileSync('system_message.txt', 'utf8');

const webhookNode = {
  parameters: {
    httpMethod: "POST",
    path: "web-chat",
    authentication: "headerAuth",
    responseMode: "responseNode",
    options: {}
  },
  type: "n8n-nodes-base.webhook",
  typeVersion: 2,
  position: [-96, 320],
  id: "a1b2c3d4-0001-4000-8000-000000000001",
  name: "Webhook",
  webhookId: "a1b2c3d4-0001-4000-8000-000000000001",
  credentials: {
    httpHeaderAuth: { id: "pB7Lt8cTKzQTNFnf", name: "Web chat auth" }
  }
};

const webAgentNode = {
  parameters: {
    promptType: "define",
    text: "={{ $json.body.message }}",
    options: { systemMessage: systemMessage }
  },
  type: "@n8n/n8n-nodes-langchain.agent",
  typeVersion: 3.1,
  position: [48, 320],
  id: "a1b2c3d4-0002-4000-8000-000000000002",
  name: "AI Agent (Web)"
};

const webChatModelNode = {
  parameters: {
    model: { __rl: true, mode: "list", value: "claude-sonnet-5", cachedResultName: "Claude Sonnet 5" },
    options: {}
  },
  type: "@n8n/n8n-nodes-langchain.lmChatAnthropic",
  typeVersion: 1.6,
  position: [48, 460],
  id: "a1b2c3d4-0003-4000-8000-000000000003",
  name: "Anthropic Chat Model (Web)",
  credentials: {
    anthropicApi: { id: "88N30wTkVWAww665", name: "Anthropic account" }
  }
};

const respondNode = {
  parameters: {
    respondWith: "text",
    responseBody: "={{ $json.output }}",
    options: {}
  },
  type: "n8n-nodes-base.respondToWebhook",
  typeVersion: 1.1,
  position: [320, 320],
  id: "a1b2c3d4-0004-4000-8000-000000000004",
  name: "Respond to Webhook"
};

d.nodes.push(webhookNode, webAgentNode, webChatModelNode, respondNode);

// New connections for the web chat path
d.connections["Webhook"] = { main: [[{ node: "AI Agent (Web)", type: "main", index: 0 }]] };
d.connections["Anthropic Chat Model (Web)"] = { ai_languageModel: [[{ node: "AI Agent (Web)", type: "ai_languageModel", index: 0 }]] };
d.connections["AI Agent (Web)"] = { main: [[{ node: "Respond to Webhook", type: "main", index: 0 }]] };

// Fan out the 4 existing tools to also serve the web agent
for (const toolName of ["log_purchases", "get_today_total", "get_recent_logs", "update_daily_log"]) {
  d.connections[toolName].ai_tool[0].push({ node: "AI Agent (Web)", type: "ai_tool", index: 0 });
}

const payload = {
  name: d.name,
  nodes: d.nodes,
  connections: d.connections,
  settings: d.settings
};

fs.writeFileSync('update_workflow4.json', JSON.stringify(payload));
console.log('Built payload with', payload.nodes.length, 'nodes');
console.log('log_purchases ai_tool targets:', JSON.stringify(payload.connections.log_purchases.ai_tool[0]));
