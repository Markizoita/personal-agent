require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_ttws1.json`);

const d = JSON.parse(fs.readFileSync('workflow_ttws1.json', 'utf8'));
const node = d.nodes.find(n => n.name === 'Is Open Event?');

node.parameters.conditions.conditions[0].leftValue = "={{ (() => { const body = $json.body || {}; const keys = Object.keys(body); const eventKey = keys.find(k => k.trim().toLowerCase() === 'event'); const val = eventKey ? String(body[eventKey]).trim().toLowerCase() : ''; return val === 'open' ? 1 : 0; })() }}";

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_ttws1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
console.log('updated expression set:', node.parameters.conditions.conditions[0].leftValue.includes('trim().toLowerCase()'));
