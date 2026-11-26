require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_nostartup1.json`);

const d = JSON.parse(fs.readFileSync('workflow_nostartup1.json', 'utf8'));
const agent = d.nodes.find(n => n.name === 'AI Agent');
let prompt = agent.parameters.options.systemMessage;

const marker = `- 10 PM Breakdown: ask only for whichever of these is still missing - food since 5 PM, gym ✅/⬜, Start Up hours + proof, mood 0-10.`;
const replacement = `- 10 PM Breakdown: ask only for whichever of these is still missing - food since 5 PM, gym ✅/⬜, mood 0-10 (Start Up is paused for now - a better system for it is coming later, don't ask about it or show it in the Breakdown or /today, even though its fields still exist).`;

if (!prompt.includes(marker)) {
  console.log('MARKER NOT FOUND - aborting');
  process.exit(1);
}
prompt = prompt.replace(marker, replacement);

const marker2 = `Then, regardless of what was missing, show the WHOLE form: Wake (wake.result + wake.streak_current/streak_best - say "not sent yet" if wake is null), Start Up, Schedule (say "nothing set yet" - schedule_items is always empty until that feature is built), Health (sleep, food list, gym), **Finance** (itemized spending_items + spending_total - this is the only check-in that shows finance), Mood.`;
const replacement2 = `Then, regardless of what was missing, show the WHOLE form (skip Start Up entirely - it's paused): Wake (wake.result + wake.streak_current/streak_best - say "not sent yet" if wake is null), Schedule (say "nothing set yet" - schedule_items is always empty until that feature is built), Health (sleep, food list, gym), #### Finance (itemized spending_items + spending_total - this is the only check-in that shows finance), Mood.`;

if (!prompt.includes(marker2)) {
  console.log('MARKER2 NOT FOUND - aborting');
  process.exit(1);
}
prompt = prompt.replace(marker2, replacement2);

const marker3 = `"/today" or "show me the whole form" -> call get_daily_form for today, show every section the same way the 10 PM Breakdown recap does (minus the tomorrow question, and including Finance), using ⬜ for anything not filled in.`;
const replacement3 = `"/today" or "show me the whole form" -> call get_daily_form for today, show every section the same way the 10 PM Breakdown recap does (minus the tomorrow question, and including Finance, but skipping Start Up - it's paused for now), using ⬜ for anything not filled in.`;

if (!prompt.includes(marker3)) {
  console.log('MARKER3 NOT FOUND - aborting');
  process.exit(1);
}
prompt = prompt.replace(marker3, replacement3);

agent.parameters.options.systemMessage = prompt;
console.log('startup paused everywhere:', prompt.includes('Start Up is paused for now') && prompt.includes('skip Start Up entirely') && prompt.includes('skipping Start Up'));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_nostartup1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
