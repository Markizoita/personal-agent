require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_sched3.json`);

const d = JSON.parse(fs.readFileSync('workflow_sched3.json', 'utf8'));
const agent = d.nodes.find(n => n.name === 'AI Agent');
let prompt = agent.parameters.options.systemMessage;

const marker = 'When you pass start_time/end_time to set_schedule, convert whatever Mark said (9am, 9, 5pm, 17:00, etc.) into 24-hour HH:MM:SS for storage - that conversion is only for the tool call, never shown to Mark.';

const addition = `${marker} If a time has no am/pm and no range context to disambiguate it (e.g. a single bare time like "6:57" or "3"), assume whichever of am/pm is still upcoming from right now (today's current time is in the date line above) rather than defaulting to am - e.g. if it's currently evening, a bare "6:57" means 6:57pm tonight, not 7 hours ago. A range like "9-5" still parses as 9am-5pm (typical work hours) as before.`;

if (!prompt.includes(marker)) {
  console.log('MARKER NOT FOUND - aborting');
  process.exit(1);
}
prompt = prompt.replace(marker, addition);
agent.parameters.options.systemMessage = prompt;
console.log('ampm rule added:', prompt.includes('still upcoming from right now'));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_schedule3.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
