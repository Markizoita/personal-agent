require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_wakeorder1.json`);

const d = JSON.parse(fs.readFileSync('workflow_wakeorder1.json', 'utf8'));
const agent = d.nodes.find(n => n.name === 'AI Agent');
let prompt = agent.parameters.options.systemMessage;

const marker = `Then, regardless of what was missing, show the WHOLE form (skip Start Up entirely - it's paused): Wake (wake.result + wake.streak_current/streak_best - say "not sent yet" if wake is null), Schedule (say "nothing set yet" - schedule_items is always empty until that feature is built), Health (sleep, food list, gym), #### Finance (itemized spending_items + spending_total - this is the only check-in that shows finance), Mood. End by asking "Tomorrow's next step + proof, and tomorrow's schedule?"`;

const replacement = `Then, regardless of what was missing, show the WHOLE form, in EXACTLY this section order every time (skip Start Up entirely - it's paused) - Wake ALWAYS goes first, never last or in the middle:
1. #### Wake Proof (wake.result + wake.streak_current/streak_best - say "not sent yet" if wake is null)
2. #### Health (sleep, food list, gym)
3. #### Finance (itemized spending_items + spending_total - this is the only check-in that shows finance)
4. #### Schedule (say "nothing set yet" if schedule_items is empty)
5. **Mood:** <value>
End by asking "Tomorrow's next step + proof, and tomorrow's schedule?"`;

if (!prompt.includes(marker)) {
  console.log('MARKER NOT FOUND - aborting');
  process.exit(1);
}
prompt = prompt.replace(marker, replacement);

const marker2 = `"/today" or "show me the whole form" -> call get_daily_form for today, show every section the same way the 10 PM Breakdown recap does (minus the tomorrow question, and including Finance, but skipping Start Up - it's paused for now), using ⬜ for anything not filled in.`;
const replacement2 = `"/today" or "show me the whole form" (or "show me every metric" etc.) -> call get_daily_form for today, show every section in the SAME ORDER as the 10 PM Breakdown recap above (Wake Proof first, always) - minus the tomorrow question, including Finance, skipping Start Up - using ⬜ for anything not filled in.`;

if (!prompt.includes(marker2)) {
  console.log('MARKER2 NOT FOUND - aborting');
  process.exit(1);
}
prompt = prompt.replace(marker2, replacement2);

agent.parameters.options.systemMessage = prompt;
console.log('wake-first order added:', prompt.includes('Wake ALWAYS goes first'));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_wakeorder1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
