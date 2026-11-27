require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_deadline1.json`);

const d = JSON.parse(fs.readFileSync('workflow_deadline1.json', 'utf8'));
const agent = d.nodes.find(n => n.name === 'AI Agent');
let prompt = agent.parameters.options.systemMessage;

const marker = `- Start Up ("startup 2h build 30m plan, proof: x") -> upsert_daily_log with p_start_build_hours, p_start_plan_hours, p_start_proof.\n`;
if (!prompt.includes(marker)) { console.log('MARKER NOT FOUND'); process.exit(1); }
prompt = prompt.replace(marker, '');
agent.parameters.options.systemMessage = prompt;
console.log('removed:', !prompt.includes('p_start_build_hours'));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_deadline1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
