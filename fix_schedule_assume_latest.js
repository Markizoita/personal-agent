require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_sched5.json`);

const d = JSON.parse(fs.readFileSync('workflow_sched5.json', 'utf8'));
const agent = d.nodes.find(n => n.name === 'AI Agent');
let prompt = agent.parameters.options.systemMessage;

const marker = 'If more than one pending item could match, call set_schedule_clarification with the list of candidates ({id, title} for each) and the raw reply text, THEN ask which one in your final answer (e.g. "1. Start up work, 8:30am-5pm\\n2. test item, 7:03-7:10pm (home)"). Otherwise, after calling check_schedule_item, reply with just the Schedule section showing that item\'s new status (times in 12-hour format as always).';

const replacement = `If more than one pending-and-overdue item exists, do NOT ask which one - default to the one with the most recent check_at (the one most recently asked about), since a short reply almost always answers whatever was just pinged. Only ask (via set_schedule_clarification, as above) in the rare case where it's genuinely unclear which is most recent (e.g. two items with the exact same check_at). After calling check_schedule_item, reply with just the Schedule section showing that item's new status (times in 12-hour format as always).`;

if (!prompt.includes(marker)) {
  console.log('MARKER NOT FOUND - aborting');
  process.exit(1);
}
prompt = prompt.replace(marker, replacement);
agent.parameters.options.systemMessage = prompt;
console.log('assume-latest rule added:', prompt.includes('default to the one with the most recent check_at'));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_schedule5.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
