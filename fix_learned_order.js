require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_learnorder1.json`);

const d = JSON.parse(fs.readFileSync('workflow_learnorder1.json', 'utf8'));
const agent = d.nodes.find(n => n.name === 'AI Agent');
let prompt = agent.parameters.options.systemMessage;

const marker = `1. #### Wake Proof (wake.result + wake.streak_current/streak_best - say "not sent yet" if wake is null)
2. #### Health (sleep, food list, gym)
3. #### Finance (itemized spending_items + spending_total - this is the only check-in that shows finance)
4. #### Schedule (say "nothing set yet" if schedule_items is empty)
5. #### Notes (notes_today - list each as "#<id> <text> · <tags>"; say "none today" if notes_today is empty)
6. #### Learned (learned_today - list each as "<title> +<delta>, now <current> of <total>"; say "nothing logged today" if empty - never flagged as missing, just shown)`;

const replacement = `1. #### Wake Proof (wake.result + wake.streak_current/streak_best - say "not sent yet" if wake is null)
2. #### Health (sleep, food list, gym)
3. #### Finance (itemized spending_items + spending_total - this is the only check-in that shows finance)
4. #### Learned (learned_today - list each as "<title> +<delta>, now <current> of <total>"; say "nothing logged today" if empty - never flagged as missing, just shown)
5. #### Schedule (say "nothing set yet" if schedule_items is empty)
6. #### Notes (notes_today - list each as "#<id> <text> · <tags>"; say "none today" if notes_today is empty)`;

if (!prompt.includes(marker)) {
  console.log('MARKER NOT FOUND - aborting');
  process.exit(1);
}
prompt = prompt.replace(marker, replacement);
agent.parameters.options.systemMessage = prompt;
console.log('order fixed:', prompt.includes('3. #### Finance') && prompt.indexOf('4. #### Learned') < prompt.indexOf('5. #### Schedule'));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_learnorder1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
