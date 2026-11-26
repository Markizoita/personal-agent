require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_latest4.json`);

const d = JSON.parse(fs.readFileSync('workflow_latest4.json', 'utf8'));

function fixNode(name, newJsonBody) {
  const n = d.nodes.find(x => x.name === name);
  if (!n) { console.log('NOT FOUND:', name); return; }
  n.parameters.jsonBody = newJsonBody;
}

const CLEAN = "(() => { const clean = v => (v === undefined || v === null || v === 'null') ? null : v;";

fixNode('upsert_daily_log', `={{ ${CLEAN} return JSON.stringify({
  p_log_date: clean($fromAI('log_date', 'the date in YYYY-MM-DD format, usually today', 'string')) || $now.format('yyyy-MM-dd'),
  p_sleep_hours: clean($fromAI('sleep_hours', 'hours slept, if mentioned', 'number')),
  p_food_item: clean($fromAI('food_item', 'a short description of the food/drink mentioned, if any', 'string')),
  p_gym_done: clean($fromAI('gym_done', 'true or false if gym was mentioned', 'boolean')),
  p_gym_note: clean($fromAI('gym_note', 'what kind of workout, if mentioned', 'string')),
  p_mood: clean($fromAI('mood', 'mood 0-10, if mentioned', 'number')),
  p_mood_note: clean($fromAI('mood_note', 'a short note on mood or the day, if mentioned', 'string')),
  p_start_build_hours: clean($fromAI('start_build_hours', 'start-up build hours, if mentioned', 'number')),
  p_start_plan_hours: clean($fromAI('start_plan_hours', 'start-up plan hours, if mentioned', 'number')),
  p_start_proof: clean($fromAI('start_proof', 'start-up proof or what was accomplished, if mentioned', 'string'))
}); })() }}`);

fixNode('get_daily_form', `={{ ${CLEAN} return JSON.stringify({
  p_log_date: clean($fromAI('log_date', 'the date in YYYY-MM-DD format - use today unless Mark asked about yesterday or another date', 'string')) || $now.format('yyyy-MM-dd')
}); })() }}`);

fixNode('log_purchases', `={{ ${CLEAN} return JSON.stringify({
  p_amount: clean($fromAI('amount', 'the purchase amount in dollars', 'number')),
  p_merchant: clean($fromAI('merchant', 'where the purchase was made', 'string')),
  p_category: clean($fromAI('category', 'spending category like essentials, non-essentials, or business', 'string')),
  p_raw_message: clean($fromAI('raw_message', 'the original message text from Mark', 'string'))
}); })() }}`);

fixNode('confirm_pending_purchase', `={{ ${CLEAN} return JSON.stringify({
  p_id: clean($fromAI('id', 'the id of the pending purchase row from get_pending_purchase', 'number')),
  p_merchant: clean($fromAI('merchant', 'where the purchase was made or what it was', 'string')),
  p_category: clean($fromAI('category', 'spending category like essentials, non-essentials, or business', 'string'))
}); })() }}`);

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_dailyform2.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
