require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_latest6.json`);

const d = JSON.parse(fs.readFileSync('workflow_latest6.json', 'utf8'));

const buildNormalContext = {
  parameters: {
    jsCode: `const msgText = $('Telegram Trigger').item.json.message.text || '';\nreturn [{ json: { context: msgText } }];`
  },
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [224, -32],
  id: 'df000005-0001-4000-8000-000000000001',
  name: 'Build Normal Reply Context'
};
d.nodes.push(buildNormalContext);

// Route to Wake? false branch -> Build Normal Reply Context -> AI Agent (was -> AI Agent directly)
d.connections['Route to Wake?'].main[1] = [{ node: 'Build Normal Reply Context', type: 'main', index: 0 }];
d.connections['Build Normal Reply Context'] = { main: [[{ node: 'AI Agent', type: 'main', index: 0 }]] };

// Simplify AI Agent's text now that every path sets $json.context
const agent = d.nodes.find(n => n.name === 'AI Agent');
agent.parameters.text = '={{ $json.context }}';

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_dailyform4.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
console.log('text now:', agent.parameters.text);
