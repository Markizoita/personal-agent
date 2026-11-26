require('./env');
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('workflow_p1.json', 'utf8'));

const SB_URL = 'https://hzwmypoifzazhekzbpos.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

function sbHeaders(extra) {
  return { parameters: [
    { name: 'apikey', value: SB_KEY },
    { name: 'Authorization', value: 'Bearer ' + SB_KEY },
    ...(extra || [])
  ] };
}

// ---------- Remove old nightly/catchup nodes, replaced by the 4 unified check-ins ----------
const REMOVE = ['Daily 10pm', 'Query Today', 'Format Daily', 'Send Daily', 'Daytime Catch-up Reminders', 'Send Catch-up Reminder'];
d.nodes = d.nodes.filter(n => !REMOVE.includes(n.name));
for (const name of REMOVE) delete d.connections[name];

// ---------- Replace log_purchases / confirm_pending_purchase with v2 (insert+return-total) ----------
const logPurchaseIdx = d.nodes.findIndex(n => n.name === 'log_purchases');
const logPurchasePos = d.nodes[logPurchaseIdx].position;
const logPurchaseId = d.nodes[logPurchaseIdx].id;
d.nodes[logPurchaseIdx] = {
  parameters: {
    toolDescription: "Logs a purchase/expense. Call this whenever Mark mentions spending money or making a purchase with its own stated amount. Returns today's updated total and itemized list directly - no need to call anything else afterward for the Finance section.",
    method: 'POST',
    url: SB_URL + '/rest/v1/rpc/log_purchase_v2',
    sendHeaders: true,
    headerParameters: sbHeaders([{ name: 'Content-Type', value: 'application/json' }]),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ p_amount: $fromAI('amount', 'the purchase amount in dollars', 'number'), p_merchant: $fromAI('merchant', 'where the purchase was made', 'string'), p_category: $fromAI('category', 'spending category like essentials, non-essentials, or business', 'string'), p_raw_message: $fromAI('raw_message', 'the original message text from Mark', 'string') }) }}",
    options: {}
  },
  type: 'n8n-nodes-base.httpRequestTool',
  typeVersion: 4.5,
  position: logPurchasePos,
  id: logPurchaseId,
  name: 'log_purchases'
};

const confirmIdx = d.nodes.findIndex(n => n.name === 'confirm_pending_purchase');
const confirmPos = d.nodes[confirmIdx].position;
const confirmId = d.nodes[confirmIdx].id;
d.nodes[confirmIdx] = {
  parameters: {
    toolDescription: "Completes a pending Apple-Pay-detected purchase once you know what it was. Pass the id from get_pending_purchase, plus merchant/item and category. Do NOT pass amount - it's already logged. Returns today's updated total and itemized list directly.",
    method: 'POST',
    url: SB_URL + '/rest/v1/rpc/confirm_pending_purchase_v2',
    sendHeaders: true,
    headerParameters: sbHeaders([{ name: 'Content-Type', value: 'application/json' }]),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ p_id: $fromAI('id', 'the id of the pending purchase row from get_pending_purchase', 'number'), p_merchant: $fromAI('merchant', 'where the purchase was made or what it was', 'string'), p_category: $fromAI('category', 'spending category like essentials, non-essentials, or business', 'string') }) }}",
    options: {}
  },
  type: 'n8n-nodes-base.httpRequestTool',
  typeVersion: 4.5,
  position: confirmPos,
  id: confirmId,
  name: 'confirm_pending_purchase'
};

// ---------- New tools: get_daily_form, upsert_daily_log ----------
const getDailyForm = {
  parameters: {
    toolDescription: "Gets the full daily form for a date: health (sleep/food/gym), finance totals, start-up, mood, wake result/streak, schedule items, tiktok minutes. Call this to check what's already logged before asking in a scheduled check-in, or to answer /today and /form.",
    method: 'POST',
    url: SB_URL + '/rest/v1/rpc/get_daily_form',
    sendHeaders: true,
    headerParameters: sbHeaders([{ name: 'Content-Type', value: 'application/json' }]),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ p_log_date: $fromAI('log_date', 'the date in YYYY-MM-DD format - use today unless Mark asked about yesterday or another date', 'string') }) }}",
    options: {}
  },
  type: 'n8n-nodes-base.httpRequestTool',
  typeVersion: 4.5,
  position: [1488, 144],
  id: 'df000001-0001-4000-8000-000000000001',
  name: 'get_daily_form'
};

const upsertDailyLog = {
  parameters: {
    toolDescription: "Logs Health/Mood/Start-Up fields for a date in one call. Leave any parameter you have no data for unset - it will not overwrite existing values. Returns the full updated row. Combine everything mentioned in one message into a single call.",
    method: 'POST',
    url: SB_URL + '/rest/v1/rpc/upsert_daily_log',
    sendHeaders: true,
    headerParameters: sbHeaders([{ name: 'Content-Type', value: 'application/json' }]),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ p_log_date: $fromAI('log_date', 'the date in YYYY-MM-DD format, usually today', 'string'), p_sleep_hours: $fromAI('sleep_hours', 'hours slept, if mentioned', 'number'), p_food_item: $fromAI('food_item', 'a short description of the food/drink mentioned, if any', 'string'), p_gym_done: $fromAI('gym_done', 'true or false if gym was mentioned', 'boolean'), p_gym_note: $fromAI('gym_note', 'what kind of workout, if mentioned', 'string'), p_mood: $fromAI('mood', 'mood 0-10, if mentioned', 'number'), p_mood_note: $fromAI('mood_note', 'a short note on mood or the day, if mentioned', 'string'), p_start_build_hours: $fromAI('start_build_hours', 'start-up build hours, if mentioned', 'number'), p_start_plan_hours: $fromAI('start_plan_hours', 'start-up plan hours, if mentioned', 'number'), p_start_proof: $fromAI('start_proof', 'start-up proof or what was accomplished, if mentioned', 'string') }) }}",
    options: {}
  },
  type: 'n8n-nodes-base.httpRequestTool',
  typeVersion: 4.5,
  position: [1648, 144],
  id: 'df000001-0001-4000-8000-000000000002',
  name: 'upsert_daily_log'
};

d.nodes.push(getDailyForm, upsertDailyLog);
d.connections['get_daily_form'] = { ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]] };
d.connections['upsert_daily_log'] = { ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]] };

// ---------- 4 unified check-ins: 8am, 2pm, 5pm, 10pm Breakdown ----------
let dfCounter = 0;
function nextId() {
  dfCounter += 1;
  return 'df000004-0001-4000-8000-' + String(dfCounter).padStart(12, '0');
}

function scheduleTrigger(name, cron, pos) {
  return {
    parameters: { rule: { interval: [{ field: 'cronExpression', expression: cron }] } },
    type: 'n8n-nodes-base.scheduleTrigger',
    typeVersion: 1.2,
    position: pos,
    id: nextId(),
    name
  };
}

function contextCode(name, pos, contextText) {
  return {
    parameters: {
      jsCode: `return [{ json: { context: ${JSON.stringify(contextText)} } }];`
    },
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: pos,
    id: nextId(),
    name
  };
}

const checkin8am = scheduleTrigger('Checkin 8am', '0 8 * * *', [-96, 2000]);
const ctx8am = contextCode('Build 8am Context', [96, 2000], 'SYSTEM: 8 AM check-in. Follow the Scheduled check-ins instructions for 8 AM.');

const checkin2pm = scheduleTrigger('Checkin 2pm', '0 14 * * *', [-96, 2150]);
const ctx2pm = contextCode('Build 2pm Context', [96, 2150], 'SYSTEM: 2 PM check-in. Follow the Scheduled check-ins instructions for 2 PM.');

const checkin5pm = scheduleTrigger('Checkin 5pm', '0 17 * * *', [-96, 2300]);
const ctx5pm = contextCode('Build 5pm Context', [96, 2300], 'SYSTEM: 5 PM check-in. Follow the Scheduled check-ins instructions for 5 PM.');

const checkinBreakdown = scheduleTrigger('Checkin 10pm Breakdown', '0 22 * * *', [-96, 2450]);
const ctxBreakdown = contextCode('Build Breakdown Context', [96, 2450], 'SYSTEM: 10 PM Breakdown. Follow the Scheduled check-ins instructions for the 10 PM Breakdown.');

d.nodes.push(checkin8am, ctx8am, checkin2pm, ctx2pm, checkin5pm, ctx5pm, checkinBreakdown, ctxBreakdown);

d.connections['Checkin 8am'] = { main: [[{ node: 'Build 8am Context', type: 'main', index: 0 }]] };
d.connections['Build 8am Context'] = { main: [[{ node: 'AI Agent', type: 'main', index: 0 }]] };
d.connections['Checkin 2pm'] = { main: [[{ node: 'Build 2pm Context', type: 'main', index: 0 }]] };
d.connections['Build 2pm Context'] = { main: [[{ node: 'AI Agent', type: 'main', index: 0 }]] };
d.connections['Checkin 5pm'] = { main: [[{ node: 'Build 5pm Context', type: 'main', index: 0 }]] };
d.connections['Build 5pm Context'] = { main: [[{ node: 'AI Agent', type: 'main', index: 0 }]] };
// Breakdown feeds both the agent AND the existing weekly/monthly chain (preserved from the old Daily 10pm)
d.connections['Checkin 10pm Breakdown'] = {
  main: [[
    { node: 'Build Breakdown Context', type: 'main', index: 0 },
    { node: 'Is Sunday?', type: 'main', index: 0 },
    { node: 'Is Last Day of Month?', type: 'main', index: 0 }
  ]]
};
d.connections['Build Breakdown Context'] = { main: [[{ node: 'AI Agent', type: 'main', index: 0 }]] };

// ---------- Fix AI Agent's text param (regression: Route to Wake?'s false branch no longer carries $json.message) ----------
const agent = d.nodes.find(n => n.name === 'AI Agent');
agent.parameters.text = "={{ $json.context || $('Telegram Trigger').item.json.message.text }}";

// ---------- Rewrite AI Agent's system prompt ----------
agent.parameters.options.systemMessage = `=You are Mark's personal daily-form assistant, running through Telegram. Today's date is {{ $now.format('M/d/yy') }} (ISO: {{ $now.format('yyyy-MM-dd') }}). Wake Proof (the 7:05am passage/streak system) is a separate agent - you never see wake-related messages, but you DO show its result/streak when asked for the daily form.

CRITICAL: whatever text you give as your final answer is sent to Mark on Telegram word for word, right now - never a status report, always the real content. Call each tool at most once per turn unless truly necessary; as soon as you've made the calls you need, stop and give your final answer immediately - never call the same tool twice in one turn.

Your job: Health (sleep, food, gym), Personal Finance (spending), Start Up (build/plan hours, proof), and Mood - plus the scheduled check-ins and /today, /form.

## Logging a message
Any incoming message may mention several of these at once - log everything it mentions, then reply with ONLY the section(s) you just updated (see Reply format). Never ask for confirmation first, just log it.

- Sleep ("slept 7h") -> upsert_daily_log with p_sleep_hours.
- Food (any meal/snack, e.g. "eggs and toast", "chicken bowl") -> upsert_daily_log with p_food_item (combine multiple foods mentioned in one message into one p_food_item string - call upsert_daily_log only once per message even if several foods are mentioned).
- Gym ("gym done", "push day", "skipped gym") -> upsert_daily_log with p_gym_done and p_gym_note if a kind is said.
- Mood ("mood 7", "feeling a 6") -> upsert_daily_log with p_mood and p_mood_note if there's a comment.
- Start Up ("startup 2h build 30m plan, proof: x") -> upsert_daily_log with p_start_build_hours, p_start_plan_hours, p_start_proof.
- A new purchase with its own stated amount (e.g. "14 chipotle") -> see Finance below.

If a message has BOTH health/mood/startup content AND a new purchase, call upsert_daily_log once AND log_purchases once (two calls, not more) - both return enough data to reply without any further tool call.

## Finance
IMPORTANT: before treating any message as a new purchase, call get_pending_purchase first - but only when the message is plausibly answering what a purchase was (short, ambiguous, or purchase-like). Skip this check for messages that are clearly just health/mood/startup logging with nothing purchase-like in them. If get_pending_purchase returns a row, that's an Apple Pay purchase that fired automatically - its amount is already logged, what it was is not. If the current message plausibly answers that, use confirm_pending_purchase with that row's id - do NOT use log_purchases for this message, and do not ask for the amount again.

If get_pending_purchase returns nothing, or the message clearly describes a brand new purchase with its own stated amount, use log_purchases.

If Mark asks to delete, remove, undo, or correct a purchase, call get_recent_purchases first. If exactly one entry clearly matches, delete it with delete_purchase. If more than one could match, list the candidates and ask which one - never guess on a delete.

For any question about spending beyond today (e.g. "how much did I spend last week"), use get_total_between and get_spending_history. Never add up or estimate spending yourself.

## Reply format after logging
log_purchases and confirm_pending_purchase return today_total/today_items directly - use those for the Finance section. upsert_daily_log returns the full current daily_log row - use that for Health/Start Up/Mood. Reply with ONLY the section(s) that changed, no extra commentary, in this shape:

Health
- Sleep: <sleep_hours>h   (only if just set)
- Food: <food items, comma separated>   (only if just changed)
- Gym: ✅/⬜ <gym_note>   (only if just changed)

Finance
- <merchant>: $<amount> (<category>)   (one line per NEW purchase just logged)
- Today: $<today_total>

Start Up
- Hours: <start_build_hours>h build / <start_plan_hours>h plan
- Proof: <start_proof>

Mood: <mood>   (only if just changed)

Only include a section if something in it just changed - never show an untouched section, and never show the whole form unless asked (see /today below).

## Scheduled check-ins
When your input starts with "SYSTEM: 8 AM check-in", "SYSTEM: 2 PM check-in", "SYSTEM: 5 PM check-in", or "SYSTEM: 10 PM Breakdown", call get_daily_form once for today, then send the check-in for that slot - ask ONLY for what's still missing (null/empty), and just state anything already logged, never ask twice for the same thing.

- 8 AM: ask "sleep last night? · breakfast?" unless both already logged (then state them instead). Finance: state any purchases since last night (or "no purchases since last night" if spending_items is empty) and today's total.
- 2 PM: ask "food since 8?" unless already answered since 8am. Finance: state new purchases since the last check-in and today's total.
- 5 PM: same shape as 2 PM, "food since 2?".
- 10 PM Breakdown: ask only for whichever of these is still missing - food since 5 PM, gym ✅/⬜, Start Up hours + proof, mood 0-10. Then, regardless of what was missing, show the WHOLE form: Wake (wake.result + wake.streak_current/streak_best - say "not sent yet" if wake is null), Start Up, Schedule (say "nothing set yet" - schedule_items is always empty until that feature is built), Health (sleep, food list, gym), Finance (itemized spending_items + spending_total), Mood. End by asking "Tomorrow's next step + proof, and tomorrow's schedule?"

Keep each check-in message compact, one line per thing, e.g.:
8 AM check-in
Health: sleep last night? · breakfast?
Finance: no purchases since last night · today $0

## /today and /form commands
"/today" or "show me the whole form" -> call get_daily_form for today, show every section the same way the 10 PM Breakdown recap does (minus the tomorrow question), using ⬜ for anything not filled in.
"/form health" (or "show me health", "/form finance", etc.) -> call get_daily_form, show just that one section.
"/form yesterday" or "/form <date>" -> call get_daily_form with that date instead of today.

Never discuss Wake Proof details beyond its result/streak, TikTok, or Notes - those are handled elsewhere or not built yet. If Mark says something unrelated to any of the above, just respond briefly and naturally, no tool calls.`;

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_dailyform1.json', JSON.stringify(payload));
console.log('built, nodeCount:', payload.nodes.length);
