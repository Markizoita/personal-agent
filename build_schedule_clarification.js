require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_sched4.json`);

const d = JSON.parse(fs.readFileSync('workflow_sched4.json', 'utf8'));
const SB_URL = 'https://hzwmypoifzazhekzbpos.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

function sbHeaders(extra) {
  return { parameters: [
    { name: 'apikey', value: SB_KEY },
    { name: 'Authorization', value: 'Bearer ' + SB_KEY },
    ...(extra || [])
  ] };
}

const getClarification = {
  parameters: {
    toolDescription: "Checks whether Mark is in the middle of answering a 'which schedule item' disambiguation you asked in your previous reply. Call this FIRST, before anything else, whenever the message is short/ambiguous (a bare number, a short word like done/x/yes, or looks like it names one of several pending schedule items) - it tells you what question you were waiting on an answer to.",
    method: 'POST',
    url: SB_URL + '/rest/v1/rpc/get_schedule_clarification',
    sendHeaders: true,
    headerParameters: sbHeaders([{ name: 'Content-Type', value: 'application/json' }]),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '{}',
    options: {}
  },
  type: 'n8n-nodes-base.httpRequestTool',
  typeVersion: 4.5,
  position: [2128, 144],
  id: 'sc000003-0001-4000-8000-000000000001',
  name: 'get_schedule_clarification'
};

const setClarification = {
  parameters: {
    toolDescription: "Call this right before you ask Mark 'which schedule item is this for' - records the candidates and his original ambiguous reply so the NEXT message can be resolved against this question. Always call this before asking, never after.",
    method: 'POST',
    url: SB_URL + '/rest/v1/rpc/set_schedule_clarification',
    sendHeaders: true,
    headerParameters: sbHeaders([{ name: 'Content-Type', value: 'application/json' }]),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ p_candidates: $fromAI('candidates', 'a JSON array of {id, title} for each pending schedule item Mark could be referring to', 'json'), p_raw_reply: $fromAI('raw_reply', \"Mark's original ambiguous reply, e.g. 'x' or 'done'\", 'string') }) }}",
    options: {}
  },
  type: 'n8n-nodes-base.httpRequestTool',
  typeVersion: 4.5,
  position: [2288, 144],
  id: 'sc000003-0001-4000-8000-000000000002',
  name: 'set_schedule_clarification'
};

d.nodes.push(getClarification, setClarification);
d.connections['get_schedule_clarification'] = { ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]] };
d.connections['set_schedule_clarification'] = { ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]] };

// ---------- Update system prompt ----------
const agent = d.nodes.find(n => n.name === 'AI Agent');
let prompt = agent.parameters.options.systemMessage;

const marker = 'Replying to a schedule check: if the message plausibly answers whether a schedule item happened and get_daily_form shows a pending schedule item whose check time has already passed, call check_schedule_item with that item\'s id.';

const replacement = `Replying to a schedule check: if the message is short/ambiguous (a bare number, "x", "done", "yes", or similar) and could plausibly be answering a schedule check, call get_schedule_clarification FIRST. If it returns pending:true, this message is Mark picking WHICH of the candidates his earlier reply (raw_reply) was about - match his current message (a number like "1"/"2" against the candidates' position, or words against a title) to one candidate's id, then call check_schedule_item with that id, re-interpreting raw_reply the same way you normally would ('done'/'yes'/'👍' -> status 'done'; "x"/"n"/"no"/"nope" -> status 'skipped'; anything else -> 'partly' or 'skipped' with p_what_happened set to raw_reply). If his message doesn't clearly pick one, ask again instead of guessing - do not call set_schedule_clarification again in that case, the existing one still stands.

If get_schedule_clarification returns pending:false (or you skipped checking it because the message clearly isn't about this), proceed normally: if get_daily_form shows a pending schedule item whose check time has already passed, call check_schedule_item with that item's id.`;

if (!prompt.includes(marker)) {
  console.log('MARKER NOT FOUND - aborting');
  process.exit(1);
}
prompt = prompt.replace(marker, replacement);

const marker2 = "If more than one pending item could match, ask which one instead of guessing. Then reply with just the Schedule section showing that item's new status (times in 12-hour format as always).";
const replacement2 = `If more than one pending item could match, call set_schedule_clarification with the list of candidates ({id, title} for each) and the raw reply text, THEN ask which one in your final answer (e.g. "1. Start up work, 8:30am-5pm\\n2. test item, 7:03-7:10pm (home)"). Otherwise, after calling check_schedule_item, reply with just the Schedule section showing that item's new status (times in 12-hour format as always).`;

if (!prompt.includes(marker2)) {
  console.log('MARKER2 NOT FOUND - aborting');
  process.exit(1);
}
prompt = prompt.replace(marker2, replacement2);

agent.parameters.options.systemMessage = prompt;
console.log('clarification instructions added:', prompt.includes('get_schedule_clarification FIRST'));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_schedule4.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
