require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_latest5.json`);

const d = JSON.parse(fs.readFileSync('workflow_latest5.json', 'utf8'));

function fixNode(name, newJsonBody) {
  const n = d.nodes.find(x => x.name === name);
  if (!n) { console.log('NOT FOUND:', name); return; }
  n.parameters.jsonBody = newJsonBody;
}

fixNode('upsert_daily_log', "={{ JSON.stringify({ p_log_date: $fromAI('log_date', 'the date in YYYY-MM-DD format, usually today', 'string'), p_sleep_hours: $fromAI('sleep_hours', 'hours slept as a number, if mentioned - otherwise leave completely blank, do not write null or zero', 'string'), p_food_item: $fromAI('food_item', 'a short description of the food/drink mentioned, if any - otherwise leave completely blank', 'string'), p_gym_done: $fromAI('gym_done', 'the word true or false if gym was mentioned - otherwise leave completely blank', 'string'), p_gym_note: $fromAI('gym_note', 'what kind of workout, if mentioned - otherwise leave completely blank', 'string'), p_mood: $fromAI('mood', 'mood 0-10 as a number, if mentioned - otherwise leave completely blank', 'string'), p_mood_note: $fromAI('mood_note', 'a short note on mood or the day, if mentioned - otherwise leave completely blank', 'string'), p_start_build_hours: $fromAI('start_build_hours', 'start-up build hours as a number, if mentioned - otherwise leave completely blank', 'string'), p_start_plan_hours: $fromAI('start_plan_hours', 'start-up plan hours as a number, if mentioned - otherwise leave completely blank', 'string'), p_start_proof: $fromAI('start_proof', 'start-up proof or what was accomplished, if mentioned - otherwise leave completely blank', 'string') }) }}");

fixNode('get_daily_form', "={{ JSON.stringify({ p_log_date: $fromAI('log_date', 'the date in YYYY-MM-DD format - use today unless Mark asked about yesterday or another date', 'string') }) }}");

fixNode('log_purchases', "={{ JSON.stringify({ p_amount: $fromAI('amount', 'the purchase amount in dollars', 'number'), p_merchant: $fromAI('merchant', 'where the purchase was made', 'string'), p_category: $fromAI('category', 'spending category like essentials, non-essentials, or business', 'string'), p_raw_message: $fromAI('raw_message', 'the original message text from Mark', 'string') }) }}");

fixNode('confirm_pending_purchase', "={{ JSON.stringify({ p_id: $fromAI('id', 'the id of the pending purchase row from get_pending_purchase', 'number'), p_merchant: $fromAI('merchant', 'where the purchase was made or what it was', 'string'), p_category: $fromAI('category', 'spending category like essentials, non-essentials, or business', 'string') }) }}");

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_dailyform3.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
