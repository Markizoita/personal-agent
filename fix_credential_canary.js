require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_canary1.json`);

const d = JSON.parse(fs.readFileSync('workflow_canary1.json', 'utf8'));
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const CRED = { id: 'yb7sQD3grJ7b2cYJ', name: 'Supabase service role' };

function credentialize(node) {
  const hp = node.parameters.headerParameters.parameters;
  node.parameters.headerParameters.parameters = hp.filter(h => !(h.value === SB_KEY || h.value === ('Bearer ' + SB_KEY)));
  node.parameters.authentication = 'predefinedCredentialType';
  node.parameters.nodeCredentialType = 'supabaseApi';
  node.credentials = Object.assign({}, node.credentials, { supabaseApi: CRED });
}

const canary = d.nodes.find(n => n.name === 'Check Due Pings');
if (!canary) { console.log('CANARY NODE NOT FOUND'); process.exit(1); }
credentialize(canary);
console.log('canary node after:', JSON.stringify(canary.parameters.headerParameters), JSON.stringify(canary.credentials));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_canary1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
