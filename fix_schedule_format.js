require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_sched2.json`);

const d = JSON.parse(fs.readFileSync('workflow_sched2.json', 'utf8'));
const agent = d.nodes.find(n => n.name === 'AI Agent');
let prompt = agent.parameters.options.systemMessage;

const oldSection = `## Schedule
Setting or editing: if a message describes schedule items with times (e.g. "9-5 work at the office, 6 gym, 7-8 dinner at home") or asks to change the existing schedule ("move gym to 7", "cancel dinner", "add 3pm call"), call get_daily_form first to see today's current schedule_items. Build the COMPLETE new list (keep every existing item that isn't being changed, apply the add/move/cancel Mark asked for), then call set_schedule once with that full array for the date - never call it more than once per message. Then reply with the full schedule in this format:

**Schedule** (<date>)
- ⬜ <start>-<end> <title>  ·  <place>
(one line per item, newest-added last; use ✅ for done, ❌ for skipped, ⚠️ for partly, ⬜ for pending; only show "· <place>" if a place was given)

You never need to compute check times yourself - set_schedule handles "no end time = check 1 hour after start" automatically.

Replying to a schedule check: if the message plausibly answers whether a schedule item happened ("done", "yes", "👍", "left at 3", "skipped, felt sick") and get_daily_form shows a pending schedule item whose check time has already passed, call check_schedule_item with that item's id - p_status 'done' for a plain done/yes/👍, 'partly' or 'skipped' as fits for anything else, using your judgment, and p_what_happened set to what Mark said (skip it for a plain done/yes). If more than one pending item could match, ask which one instead of guessing. Then reply with just the Schedule section showing that item's new status.

"/schedule" -> call get_daily_form, show today's Schedule section the same way as above.`;

const newSection = `## Schedule
Setting or editing: if a message describes schedule items with times (e.g. "9-5 work at the office, 6 gym, 7-8 dinner at home") or asks to change the existing schedule ("move gym to 7", "cancel dinner", "add 3pm call"), call get_daily_form first to see today's current schedule_items. Build the COMPLETE new list (keep every existing item that isn't being changed, apply the add/move/cancel Mark asked for), then call set_schedule once with that full array for the date - never call it more than once per message. When you pass start_time/end_time to set_schedule, convert whatever Mark said (9am, 9, 5pm, 17:00, etc.) into 24-hour HH:MM:SS for storage - that conversion is only for the tool call, never shown to Mark.

Always DISPLAY times back to Mark in everyday 12-hour US format, never 24-hour/military time - e.g. "8:30-5pm", "6pm", "7-8pm", never "08:30-17:00". Reply with the full schedule in this format:

**Schedule** (<date>)
- ⬜ <start>-<end in 12-hour format> <title>  ·  <place>
(one line per item, newest-added last; use ✅ for done, ❌ for skipped, ⚠️ for partly, ⬜ for pending; only show "· <place>" if a place was given)

You never need to compute check times yourself - set_schedule handles "no end time = check 1 hour after start" automatically.

Replying to a schedule check: if the message plausibly answers whether a schedule item happened and get_daily_form shows a pending schedule item whose check time has already passed, call check_schedule_item with that item's id.
- "done", "yes", "y", "👍" -> p_status 'done', no p_what_happened.
- "x", "n", "no", "nope" (a short, plain negative with no explanation) -> p_status 'skipped', no p_what_happened - this is the quick one-character way to mark something as not done, don't ask for more detail unless Mark gives it.
- Anything with more detail ("left at 3", "skipped, felt sick") -> p_status 'partly' or 'skipped' as fits your judgment, p_what_happened set to what Mark said.
If more than one pending item could match, ask which one instead of guessing. Then reply with just the Schedule section showing that item's new status (times in 12-hour format as always).

"/schedule" -> call get_daily_form, show today's Schedule section the same way as above.`;

if (!prompt.includes(oldSection)) {
  console.log('OLD SECTION NOT FOUND - aborting');
  process.exit(1);
}
prompt = prompt.replace(oldSection, newSection);
agent.parameters.options.systemMessage = prompt;
console.log('12-hour instruction added:', prompt.includes('never 24-hour/military time'));
console.log('x-shorthand added:', prompt.includes('quick one-character way'));

const pingNode = d.nodes.find(n => n.name === 'Format Schedule Ping');
pingNode.parameters.jsCode = `const items = $json.items;
const fmt12 = t => {
  if (!t) return '';
  const [hStr, m] = t.split(':');
  let h = parseInt(hStr, 10);
  const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12; if (h === 0) h = 12;
  return m === '00' ? (h + ampm) : (h + ':' + m + ampm);
};
const lines = items.map(it => {
  const time = it.end_time ? (fmt12(it.start_time) + '-' + fmt12(it.end_time)) : fmt12(it.start_time);
  const place = it.place ? (' · ' + it.place) : '';
  return '*' + it.title + '*, ' + time + place + ': done? \\u2705 or tell me what happened';
});
return [{ json: { text: lines.join('\\n') } }];`;
console.log('ping node updated to 12-hour:', pingNode.parameters.jsCode.includes('fmt12'));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_schedule2.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
