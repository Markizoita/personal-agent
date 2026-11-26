require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_time1.json`);

const d = JSON.parse(fs.readFileSync('workflow_time1.json', 'utf8'));
const agent = d.nodes.find(n => n.name === 'AI Agent');
let prompt = agent.parameters.options.systemMessage;

const marker = "Today's date is {{ $now.format('M/d/yy') }} (ISO: {{ $now.format('yyyy-MM-dd') }}).";
const replacement = "Today's date is {{ $now.format('M/d/yy') }} (ISO: {{ $now.format('yyyy-MM-dd') }}), and the current time right now is {{ $now.format('h:mm a') }} (24-hour: {{ $now.format('HH:mm') }}) America/New_York. Use this to judge whether a schedule item's check_at time has already passed.";

if (!prompt.includes(marker)) {
  console.log('MARKER NOT FOUND - aborting');
  process.exit(1);
}
prompt = prompt.replace(marker, replacement);
agent.parameters.options.systemMessage = prompt;
console.log('current time added:', prompt.includes('the current time right now is'));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_time1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
