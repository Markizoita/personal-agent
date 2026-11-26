require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_suprompt1.json`);

const d = JSON.parse(fs.readFileSync('workflow_suprompt1.json', 'utf8'));
const agent = d.nodes.find(n => n.name === 'AI Agent');
let prompt = agent.parameters.options.systemMessage;

// 1. Add the Start Up Ops section before "## /today and /form commands", and fix the pre-existing
//    duplicated heading while we're right next to it.
const marker = `## /today and /form commands

## /today and /form commands`;
const startupSection = `## Start Up Ops
A work timer + to-do list, separate from the old paused Start Up fields. The Start/Stop buttons on Mark's keyboard handle the timer directly - you never see those button presses. If Mark instead types "start <project>" or "stop" in plain text, call start_startup_session / stop_startup_session yourself.

To-dos: "todo: <project>: text" -> add_startup_todo (day 'today', tag 'new'). "tomorrow: <project>: text" -> add_startup_todo (day 'tomorrow', tag 'planned'). "done <text or number>" -> complete_startup_todo.

Proof: if Mark replies to a "Goal hit. Proof?" message, or describes something he shipped/finished for Start Up work, call log_startup_proof - do not ask for confirmation first.

Display: everything you need is already in get_daily_form's \`startup\` field (level, total_xp, goal_minutes, minutes_today, open_session, todos_today, todos_tomorrow, result, proof_today) - never call a separate tool for this. Format minutes as h:mm. Example, for startup = {level:2, total_xp:140, goal_minutes:240, minutes_today:55, open_session:{open:true,start_at:"...08:42:00Z"}, todos_today:[{text:"Fix TikTok webhook",done:false},{text:"Review notes",done:true}], result:null, proof_today:[]}:
#### Start Up Ops
- Level 2 · XP 140 · goal 4h
- Working now · 55m today (or "Not started today" if open_session.open is false and minutes_today is 0)
- To-dos: ☐ Fix TikTok webhook, ☑ Review notes
- Proof: none yet (or list proof_today's entries)
If result is already set (Win/Showed up/Miss/Off) for today, show it instead of "Working now"/"Not started today": "- Result: ✅ Win".

## /today and /form commands`;

if (!prompt.includes(marker)) { console.log('MARKER NOT FOUND'); process.exit(1); }
prompt = prompt.replace(marker, startupSection);

// 2. Insert into the whole-form section order (currently 1 Wake, 2 Health, 3 Finance, 4 Learned,
//    5 TikTok, 6 Schedule, 7 Notes) - Start Up Ops becomes 6, Schedule/Notes renumber to 7/8.
const orderMarker = `5. #### TikTok (tiktok_minutes as h:mm; say "0m" if it's 0 - never flagged as missing)
6. #### Schedule (say "nothing set yet" if schedule_items is empty)
7. #### Notes (notes_today - list each as "#<id> <text> · <tags>"; say "none today" if notes_today is empty)`;
const orderReplacement = `5. #### TikTok (tiktok_minutes as h:mm; say "0m" if it's 0 - never flagged as missing)
6. #### Start Up Ops (same shape as the Start Up Ops display rule above - never flagged as missing, just shown)
7. #### Schedule (say "nothing set yet" if schedule_items is empty)
8. #### Notes (notes_today - list each as "#<id> <text> · <tags>"; say "none today" if notes_today is empty)`;
if (!prompt.includes(orderMarker)) { console.log('ORDER MARKER NOT FOUND'); process.exit(1); }
prompt = prompt.replace(orderMarker, orderReplacement);

// 3. Also show Start Up Ops in the /today whole-form rule.
prompt = prompt.replace(
  '"/today" or "show me the whole form" (or "show me every metric" etc.) -> call get_daily_form for today, show every section in the SAME ORDER as the 10 PM Breakdown recap above (Wake Proof first, always) - minus the tomorrow question, including Finance, skipping Start Up - using ⬜ for anything not filled in.',
  '"/today" or "show me the whole form" (or "show me every metric" etc.) -> call get_daily_form for today, show every section in the SAME ORDER as the 10 PM Breakdown recap above (Wake Proof first, always) - minus the tomorrow question, including Finance and Start Up Ops, skipping the old paused Start Up fields - using ⬜ for anything not filled in.'
);

agent.parameters.options.systemMessage = prompt;
console.log('startup section added:', prompt.includes('## Start Up Ops'));
console.log('duplicate heading fixed:', !prompt.includes('## /today and /form commands\n\n## /today and /form commands'));
console.log('order updated:', prompt.includes('6. #### Start Up Ops') && prompt.includes('7. #### Schedule') && prompt.includes('8. #### Notes'));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_suprompt1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
