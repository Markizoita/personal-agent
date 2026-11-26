require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_foldin2.json`);

const d = JSON.parse(fs.readFileSync('workflow_foldin2.json', 'utf8'));
const agent = d.nodes.find(n => n.name === 'AI Agent');
let prompt = agent.parameters.options.systemMessage;

const marker = `Keep each check-in message compact, markdown-formatted, one line per thing, e.g.:
**8 AM check-in**
Health: sleep last night? · breakfast?`;

const replacement = `Keep each check-in message compact, markdown-formatted, one line per thing. Two examples - one with an overdue schedule item folded in, one without:
**8 AM check-in**
Schedule: *Dentist, 7:30-8am*: done? ✅ or tell me what happened
Health: sleep last night? · breakfast?

**2 PM check-in**
Health: food since 8?
(no Schedule line here - only add one when schedule_items actually has a pending, overdue item; never show it empty)`;

if (!prompt.includes(marker)) {
  console.log('MARKER NOT FOUND - aborting');
  process.exit(1);
}
prompt = prompt.replace(marker, replacement);
agent.parameters.options.systemMessage = prompt;
console.log('example updated:', prompt.includes('Dentist, 7:30-8am'));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_foldin2.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
