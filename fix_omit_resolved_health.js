require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_omit1.json`);

const d = JSON.parse(fs.readFileSync('workflow_omit1.json', 'utf8'));
const agent = d.nodes.find(n => n.name === 'AI Agent');
let prompt = agent.parameters.options.systemMessage;

const marker = `None of the 8 AM/2 PM/5 PM check-ins mention finance at all - Mark already gets notified the moment any purchase is logged.`;
const addition = `${marker} Each line (Health, Schedule) is independent and only appears when it actually has something to ask or report right now - never show a line just to restate something already fully logged with nothing new. If food is still missing, show Health asking for it; if food is already fully logged and nothing else in Health changed, leave the Health line out entirely. Same logic applies everywhere a line could be included - only show what's actually relevant this time.`;

if (!prompt.includes(marker)) {
  console.log('MARKER NOT FOUND - aborting');
  process.exit(1);
}
prompt = prompt.replace(marker, addition);

const marker2 = `**2 PM check-in**
Health: food since 8?
(no Schedule line here - only add one when schedule_items actually has a pending, overdue item; never show it empty)`;
const replacement2 = `**2 PM check-in**
Health: food since 8?
(no Schedule line here - only add one when schedule_items actually has a pending, overdue item; never show it empty)

**5 PM check-in**
Schedule: *Dentist, 4:30-5pm*: done? ✅ or tell me what happened
(no Health line here - food since 2 was already logged with nothing new, so it's left out entirely rather than restated)`;

if (!prompt.includes(marker2)) {
  console.log('MARKER2 NOT FOUND - aborting');
  process.exit(1);
}
prompt = prompt.replace(marker2, replacement2);

agent.parameters.options.systemMessage = prompt;
console.log('omit-resolved rule added:', prompt.includes('leave the Health line out entirely'));
console.log('third example added:', prompt.includes('left out entirely rather than restated'));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_omit1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
