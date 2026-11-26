require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_nomood1.json`);

const d = JSON.parse(fs.readFileSync('workflow_nomood1.json', 'utf8'));
const agent = d.nodes.find(n => n.name === 'AI Agent');
let prompt = agent.parameters.options.systemMessage;

// Remove Mood from the Breakdown's "ask only for gaps" list
const marker1 = `- 10 PM Breakdown: ask only for whichever of these is still missing - food since 5 PM, gym ✅/⬜, mood 0-10 (Start Up is paused for now - a better system for it is coming later, don't ask about it or show it in the Breakdown or /today, even though its fields still exist).`;
const replacement1 = `- 10 PM Breakdown: ask only for whichever of these is still missing - food since 5 PM, gym ✅/⬜ (Start Up and Mood are both paused for now - don't ask about either or show them in the Breakdown or /today, even though their fields still exist).`;
if (!prompt.includes(marker1)) { console.log('MARKER1 NOT FOUND'); process.exit(1); }
prompt = prompt.replace(marker1, replacement1);

// Update the whole-form section order: Wake, Health, Finance, Schedule, Notes - drop Mood
const marker2 = `Then, regardless of what was missing, show the WHOLE form, in EXACTLY this section order every time (skip Start Up entirely - it's paused) - Wake ALWAYS goes first, never last or in the middle:
1. #### Wake Proof (wake.result + wake.streak_current/streak_best - say "not sent yet" if wake is null)
2. #### Health (sleep, food list, gym)
3. #### Finance (itemized spending_items + spending_total - this is the only check-in that shows finance)
4. #### Schedule (say "nothing set yet" if schedule_items is empty)
5. **Mood:** <value>
End by asking "Tomorrow's next step + proof, and tomorrow's schedule?"`;

const replacement2 = `Then, regardless of what was missing, show the WHOLE form, in EXACTLY this section order every time (skip Start Up and Mood entirely - both paused) - Wake ALWAYS goes first, never last or in the middle:
1. #### Wake Proof (wake.result + wake.streak_current/streak_best - say "not sent yet" if wake is null)
2. #### Health (sleep, food list, gym)
3. #### Finance (itemized spending_items + spending_total - this is the only check-in that shows finance)
4. #### Schedule (say "nothing set yet" if schedule_items is empty)
5. #### Notes (notes_today - list each as "#<id> <text> · <tags>"; say "none today" if notes_today is empty)
End by asking "Tomorrow's next step + proof, and tomorrow's schedule?"`;

if (!prompt.includes(marker2)) { console.log('MARKER2 NOT FOUND'); process.exit(1); }
prompt = prompt.replace(marker2, replacement2);

// Remove the Mood line from the logging reply-format section
const marker3 = `**Mood:** <mood>   (only if just changed)

Only include a section if something in it just changed`;
const replacement3 = `Only include a section if something in it just changed`;
if (!prompt.includes(marker3)) { console.log('MARKER3 NOT FOUND'); process.exit(1); }
prompt = prompt.replace(marker3, replacement3);

agent.parameters.options.systemMessage = prompt;
console.log('mood removed + notes added:', prompt.includes('#### Notes (notes_today') && !prompt.includes('mood 0-10 ('));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_nomood1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
