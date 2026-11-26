require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_sched1.json`);

const d = JSON.parse(fs.readFileSync('workflow_sched1.json', 'utf8'));
const SB_URL = 'https://hzwmypoifzazhekzbpos.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const SB_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

function sbHeaders(extra) {
  return { parameters: [
    { name: 'apikey', value: SB_KEY },
    { name: 'Authorization', value: 'Bearer ' + SB_KEY },
    ...(extra || [])
  ] };
}

// ---------- Tools: set_schedule, check_schedule_item ----------
const setSchedule = {
  parameters: {
    toolDescription: "Sets or replaces the FULL schedule for a date. Always pass the complete list of items that should exist for that date, not just a changed one - if this is an edit (move/cancel/add), call get_daily_form first to see the current schedule_items, then include every item that should remain plus your change. Returns the full new list.",
    method: 'POST',
    url: SB_URL + '/rest/v1/rpc/set_schedule',
    sendHeaders: true,
    headerParameters: sbHeaders([{ name: 'Content-Type', value: 'application/json' }]),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ p_log_date: $fromAI('log_date', 'the date in YYYY-MM-DD format, usually today', 'string'), p_items: $fromAI('items', 'a JSON array of the complete schedule for the date, each item shaped {title, start_time, end_time, place} - start_time/end_time in HH:MM:SS 24-hour format, end_time as empty string if not given, place as empty string if not given', 'json') }) }}",
    options: {}
  },
  type: 'n8n-nodes-base.httpRequestTool',
  typeVersion: 4.5,
  position: [1808, 144],
  id: 'sc000001-0001-4000-8000-000000000001',
  name: 'set_schedule'
};

const checkScheduleItem = {
  parameters: {
    toolDescription: "Marks the outcome of one schedule item once Mark replies about it. p_status must be 'done', 'partly', or 'skipped'. Returns the updated item.",
    method: 'POST',
    url: SB_URL + '/rest/v1/rpc/check_schedule_item',
    sendHeaders: true,
    headerParameters: sbHeaders([{ name: 'Content-Type', value: 'application/json' }]),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ p_id: $fromAI('id', 'the schedule item id, from get_daily_form schedule_items', 'number'), p_status: $fromAI('status', \"done, partly, or skipped\", 'string'), p_what_happened: $fromAI('what_happened', 'what Mark said happened, if he said more than a plain done/yes - otherwise leave blank', 'string') }) }}",
    options: {}
  },
  type: 'n8n-nodes-base.httpRequestTool',
  typeVersion: 4.5,
  position: [1968, 144],
  id: 'sc000001-0001-4000-8000-000000000002',
  name: 'check_schedule_item'
};

d.nodes.push(setSchedule, checkScheduleItem);
d.connections['set_schedule'] = { ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]] };
d.connections['check_schedule_item'] = { ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]] };

// ---------- Schedule poll (every 5 min): ping items whose check time has come ----------
const schedulePoll = {
  parameters: { rule: { interval: [{ field: 'cronExpression', expression: '*/5 * * * *' }] } },
  type: 'n8n-nodes-base.scheduleTrigger',
  typeVersion: 1.2,
  position: [-96, 2650],
  id: 'sc000002-0001-4000-8000-000000000001',
  name: 'Schedule Poll'
};

const checkDuePings = {
  parameters: {
    method: 'POST',
    url: SB_URL + '/rest/v1/rpc/get_due_schedule_pings',
    sendHeaders: true,
    headerParameters: sbHeaders([{ name: 'Content-Type', value: 'application/json' }]),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '{}',
    options: {}
  },
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [96, 2650],
  id: 'sc000002-0001-4000-8000-000000000002',
  name: 'Check Due Pings',
  retryOnFail: true,
  maxTries: 3,
  waitBetweenTries: 2000
};

const hasDuePings = {
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 1 },
      conditions: [
        {
          id: 'cond1',
          leftValue: '={{ $json.items.length > 0 ? 1 : 0 }}',
          rightValue: '={{ 1 }}',
          operator: { type: 'number', operation: 'equals' }
        }
      ],
      combinator: 'and'
    },
    options: {}
  },
  type: 'n8n-nodes-base.if',
  typeVersion: 2.2,
  position: [288, 2650],
  id: 'sc000002-0001-4000-8000-000000000003',
  name: 'Has Due Pings?'
};

const formatSchedulePing = {
  parameters: {
    jsCode: `const items = $json.items;
const lines = items.map(it => {
  const fmt = t => t ? t.slice(0,5) : '';
  const time = it.end_time ? (fmt(it.start_time) + '-' + fmt(it.end_time)) : fmt(it.start_time);
  const place = it.place ? (' · ' + it.place) : '';
  return '*' + it.title + '*, ' + time + place + ': done? ✅ or tell me what happened';
});
return [{ json: { text: lines.join('\\n') } }];`
  },
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [480, 2650],
  id: 'sc000002-0001-4000-8000-000000000004',
  name: 'Format Schedule Ping'
};

const sendSchedulePing = {
  parameters: {
    method: 'POST',
    url: 'https://api.telegram.org/bot' + SB_TOKEN + '/sendRichMessage',
    sendHeaders: true,
    headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ chat_id: '" + CHAT_ID + "', rich_message: { markdown: $json.text } }) }}",
    options: {}
  },
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [672, 2650],
  id: 'sc000002-0001-4000-8000-000000000005',
  name: 'Send Schedule Ping',
  retryOnFail: true,
  maxTries: 3,
  waitBetweenTries: 2000
};

d.nodes.push(schedulePoll, checkDuePings, hasDuePings, formatSchedulePing, sendSchedulePing);
d.connections['Schedule Poll'] = { main: [[{ node: 'Check Due Pings', type: 'main', index: 0 }]] };
d.connections['Check Due Pings'] = { main: [[{ node: 'Has Due Pings?', type: 'main', index: 0 }]] };
d.connections['Has Due Pings?'] = { main: [[{ node: 'Format Schedule Ping', type: 'main', index: 0 }], []] };
d.connections['Format Schedule Ping'] = { main: [[{ node: 'Send Schedule Ping', type: 'main', index: 0 }]] };

// ---------- Update AI Agent system prompt: add Schedule handling ----------
const agent = d.nodes.find(n => n.name === 'AI Agent');
let prompt = agent.parameters.options.systemMessage;

const scheduleSection = `

## Schedule
Setting or editing: if a message describes schedule items with times (e.g. "9-5 work at the office, 6 gym, 7-8 dinner at home") or asks to change the existing schedule ("move gym to 7", "cancel dinner", "add 3pm call"), call get_daily_form first to see today's current schedule_items. Build the COMPLETE new list (keep every existing item that isn't being changed, apply the add/move/cancel Mark asked for), then call set_schedule once with that full array for the date - never call it more than once per message. Then reply with the full schedule in this format:

**Schedule** (<date>)
- ⬜ <start>-<end> <title>  ·  <place>
(one line per item, newest-added last; use ✅ for done, ❌ for skipped, ⚠️ for partly, ⬜ for pending; only show "· <place>" if a place was given)

You never need to compute check times yourself - set_schedule handles "no end time = check 1 hour after start" automatically.

Replying to a schedule check: if the message plausibly answers whether a schedule item happened ("done", "yes", "👍", "left at 3", "skipped, felt sick") and get_daily_form shows a pending schedule item whose check time has already passed, call check_schedule_item with that item's id - p_status 'done' for a plain done/yes/👍, 'partly' or 'skipped' as fits for anything else, using your judgment, and p_what_happened set to what Mark said (skip it for a plain done/yes). If more than one pending item could match, ask which one instead of guessing. Then reply with just the Schedule section showing that item's new status.

"/schedule" -> call get_daily_form, show today's Schedule section the same way as above.`;

prompt = prompt.replace(
  '## /today and /form commands',
  scheduleSection.trim() + '\n\n## /today and /form commands'
);

// Check-ins: mention folding in overdue schedule items
prompt = prompt.replace(
  '- 8 AM: ask "sleep last night? · breakfast?" unless both already logged (then state them instead).',
  '- Also check schedule_items: for any item that is still \'pending\' and whose check_at has already passed, add one line asking about it the same way a schedule ping would ("<title>, <start>-<end>: done? ✅ or tell me what happened") - this is how overdue schedule checks get folded in instead of pinging separately.\n- 8 AM: ask "sleep last night? · breakfast?" unless both already logged (then state them instead).'
);
prompt = prompt.replace(
  '- 10 PM Breakdown: ask only for whichever of these is still missing - food since 5 PM, gym ✅/⬜, Start Up hours + proof, mood 0-10.',
  '- 10 PM Breakdown: ask only for whichever of these is still missing - food since 5 PM, gym ✅/⬜, Start Up hours + proof, mood 0-10, and any still-pending schedule item whose check_at has passed (same fold-in line as above).'
);

agent.parameters.options.systemMessage = prompt;
console.log('schedule section added:', prompt.includes('## Schedule'));
console.log('foldin added:', prompt.includes('this is how overdue schedule checks get folded in'));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_schedule1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
