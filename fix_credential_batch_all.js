require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_batchcred1.json`);

const d = JSON.parse(fs.readFileSync('workflow_batchcred1.json', 'utf8'));
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const CRED = { id: 'yb7sQD3grJ7b2cYJ', name: 'Supabase service role' };

let count = 0;
d.nodes.forEach(node => {
  const hp = node.parameters && node.parameters.headerParameters && node.parameters.headerParameters.parameters;
  if (!hp) return;
  const matches = hp.some(h => h.value === SB_KEY || h.value === ('Bearer ' + SB_KEY));
  if (!matches) return;

  node.parameters.headerParameters.parameters = hp.filter(h => !(h.value === SB_KEY || h.value === ('Bearer ' + SB_KEY)));
  node.parameters.authentication = 'predefinedCredentialType';
  node.parameters.nodeCredentialType = 'supabaseApi';
  node.credentials = Object.assign({}, node.credentials, { supabaseApi: CRED });
  count++;
});

console.log('nodes credentialized this run:', count);

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_batchcred1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
