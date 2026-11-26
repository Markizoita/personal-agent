require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_sdw1.json`);

const d = JSON.parse(fs.readFileSync('workflow_sdw1.json', 'utf8'));
const agent = d.nodes.find(n => n.name === 'AI Agent');
let prompt = agent.parameters.options.systemMessage;

const marker = `Setting or editing: if a message describes schedule items with times (e.g. "9-5 work at the office, 6 gym, 7-8 dinner at home") or asks to change the existing schedule ("move gym to 7", "cancel dinner", "add 3pm call"), call get_daily_form first to see today's current schedule_items.`;
const replacement = `Setting or editing: if a message describes schedule items with times (e.g. "9-5 work at the office, 6 gym, 7-8 dinner at home") or asks to change the existing schedule ("move gym to 7", "cancel dinner", "add 3pm call", "delete gym", "remove dinner"), call get_daily_form first to see today's current schedule_items. "Cancel", "delete", and "remove" all mean the same thing for a schedule item - treat them identically. IMPORTANT: before treating a delete/remove request as a purchase or a note, check whether the name given matches (even loosely/partially) a title in today's schedule_items - if it does, it's a schedule removal, not a purchase or note delete. Never reply "can't find anything matching X" without first checking get_daily_form's schedule_items for a title match.`;

if (!prompt.includes(marker)) {
  console.log('MARKER NOT FOUND - aborting');
  process.exit(1);
}
prompt = prompt.replace(marker, replacement);
agent.parameters.options.systemMessage = prompt;
console.log('delete/remove synonym added:', prompt.includes('"Cancel", "delete", and "remove" all mean the same thing'));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_sdw1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
