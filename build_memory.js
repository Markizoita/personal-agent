require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_mem1.json`);

const d = JSON.parse(fs.readFileSync('workflow_mem1.json', 'utf8'));

const memoryNode = {
  parameters: {
    sessionIdType: 'customKey',
    sessionKey: "={{ $('Telegram Trigger').item.json.message.chat.id }}",
    tableName: 'n8n_chat_histories',
    contextWindowLength: 20
  },
  type: '@n8n/n8n-nodes-langchain.memoryPostgresChat',
  typeVersion: 1.3,
  position: [800, 300],
  id: 'mm000001-0001-4000-8000-000000000001',
  name: 'Postgres Chat Memory',
  credentials: { postgres: { id: 'fL3768r44fVRU6al', name: 'Supabase Postgres (direct)' } }
};

d.nodes.push(memoryNode);
d.connections['Postgres Chat Memory'] = { ai_memory: [[{ node: 'AI Agent', type: 'ai_memory', index: 0 }]] };

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_mem1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
