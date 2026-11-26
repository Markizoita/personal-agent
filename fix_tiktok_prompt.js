require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_tiktokprompt1.json`);

const d = JSON.parse(fs.readFileSync('workflow_tiktokprompt1.json', 'utf8'));
const agent = d.nodes.find(n => n.name === 'AI Agent');
let prompt = agent.parameters.options.systemMessage;

// Add a TikTok section before /today
const marker = '## /today and /form commands';
const tiktokSection = `## TikTok
Fully automatic - Mark never types anything for this, it's tracked by his phone. Never ask about it, never treat any message as TikTok input. Just display tiktok_minutes (from get_daily_form) in check-ins and the whole form, formatted as h:mm (e.g. 72 -> "1h 12m", under 60 -> "48m"). "/tiktok" -> call get_tiktok_week, reply:
TikTok · today
- <today's minutes from the first entry in days>
Last 7 days: <date> <minutes>, <date> <minutes>, ... (one per day returned)

${marker}`;

if (!prompt.includes(marker)) { console.log('MARKER NOT FOUND'); process.exit(1); }
prompt = prompt.replace(marker, tiktokSection);

// Add TikTok line to each check-in (state only, never ask - purely informational)
prompt = prompt.replace(
  '- 8 AM: ask "sleep last night? · breakfast?" unless both already logged (then state them instead). Learned: if learned_today has entries, state them ("Learned: <title> +<delta>, now <current> of <total>" per item); otherwise ask once, no pressure: "anything read or listened to?"',
  '- 8 AM: ask "sleep last night? · breakfast?" unless both already logged (then state them instead). Learned: if learned_today has entries, state them ("Learned: <title> +<delta>, now <current> of <total>" per item); otherwise ask once, no pressure: "anything read or listened to?" TikTok: state tiktok_minutes as one line ("TikTok: <h:mm> today") if greater than 0, otherwise leave it out - never ask about it.'
);
prompt = prompt.replace(
  '- 2 PM: ask "food since 8?" unless already answered since 8am. Learned: same as 8 AM - state learned_today entries if present, otherwise ask "anything read or listened to since this morning?"',
  '- 2 PM: ask "food since 8?" unless already answered since 8am. Learned: same as 8 AM - state learned_today entries if present, otherwise ask "anything read or listened to since this morning?" TikTok: same as 8 AM, state only, never ask.'
);
prompt = prompt.replace(
  '- 5 PM: same shape as 2 PM, "food since 2?". Learned: same pattern as above.',
  '- 5 PM: same shape as 2 PM, "food since 2?". Learned: same pattern as above. TikTok: same, state only.'
);
prompt = prompt.replace(
  '- 10 PM Breakdown: ask only for whichever of these is still missing - food since 5 PM, gym ✅/⬜, and (gently, no pressure) anything read or listened to if learned_today is still empty (Start Up and Mood are both paused for now - don\'t ask about either or show them in the Breakdown or /today, even though their fields still exist).',
  '- 10 PM Breakdown: ask only for whichever of these is still missing - food since 5 PM, gym ✅/⬜, and (gently, no pressure) anything read or listened to if learned_today is still empty. TikTok is never asked about, only shown if tiktok_minutes > 0 (Start Up and Mood are both paused for now - don\'t ask about either or show them in the Breakdown or /today, even though their fields still exist).'
);

// Add TikTok to the whole-form order, after Learned
prompt = prompt.replace(
  '4. #### Learned (learned_today - list each as "<title> +<delta>, now <current> of <total>"; say "nothing logged today" if empty - never flagged as missing, just shown)',
  '4. #### Learned (learned_today - list each as "<title> +<delta>, now <current> of <total>"; say "nothing logged today" if empty - never flagged as missing, just shown)\n5. #### TikTok (tiktok_minutes as h:mm; say "0m" if it\'s 0 - never flagged as missing)'
);
// Renumber the following two (Schedule, Notes) from 5/6 to 6/7
prompt = prompt.replace('5. #### Schedule (say "nothing set yet" if schedule_items is empty)', '6. #### Schedule (say "nothing set yet" if schedule_items is empty)');
prompt = prompt.replace('6. #### Notes (notes_today', '7. #### Notes (notes_today');

agent.parameters.options.systemMessage = prompt;
console.log('tiktok section added:', prompt.includes('## TikTok'));
console.log('checkins updated:', prompt.includes('TikTok: state tiktok_minutes'));
console.log('order updated:', prompt.includes('5. #### TikTok') && prompt.includes('6. #### Schedule') && prompt.includes('7. #### Notes'));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_tiktokprompt1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
