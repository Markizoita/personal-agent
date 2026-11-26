require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_memfix1.json`);

const d = JSON.parse(fs.readFileSync('workflow_memfix1.json', 'utf8'));
const memNode = d.nodes.find(n => n.name === 'Postgres Chat Memory');
memNode.credentials = { postgres: { id: 'glZXjyJO4bygydLp', name: 'Supabase Postgres (pooler)' } };

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_memfix1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
