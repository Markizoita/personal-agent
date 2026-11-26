// Tweak #2: the bot only confirmed one part of a multi-part check-in reply,
// because scheduled check-ins were never saved to conversation history.
//  A) Save Conversation Turn falls back to Mark's chat id on scheduled runs
//     (needs fix_save_checkin_turns.sql), and schedule pings are saved too.
//  B) Prompt rule: answer/confirm every part of a reply to a check-in.
// Safe to re-run.
require('./env');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const BASE = 'https://bot.marizo.site/api/v1';
const KEY = process.env.N8N_API_KEY;
const MAIN_ID = 'lULFqqQFMNb8byt2';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '9227739951';

function api(method, url, body) {
  let data = '';
  if (body) {
    const tmp = path.join(os.tmpdir(), `n8n_body_${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify(body));
    data = `-H "Content-Type: application/json" --data-binary @${tmp}`;
  }
  const json = JSON.parse(execSync(`curl -s -X ${method} "${BASE}${url}" -H "X-N8N-API-KEY: ${KEY}" ${data}`).toString());
  if (json.message && !json.id && !json.data) throw new Error(`${method} ${url}: ${json.message}`);
  return json;
}

const wf = api('GET', `/workflows/${MAIN_ID}`);
fs.writeFileSync('workflow_before_checkin_memory.json', JSON.stringify(wf, null, 2));
const byName = n => wf.nodes.find(x => x.name === n);

// A1. Scheduled runs have no Telegram Trigger -> use Mark's chat id instead of null.
const save = byName('Save Conversation Turn');
const oldChat = "catch (e) { return null; } })(), p_user_text";
const newChat = `catch (e) { return '${CHAT_ID}'; } })(), p_user_text`;
if (!save.parameters.jsonBody.includes(newChat)) {
  if (!save.parameters.jsonBody.includes(oldChat)) throw new Error('Save Conversation Turn body changed - aborting');
  save.parameters.jsonBody = save.parameters.jsonBody.replace(oldChat, newChat);
}

// A2. Schedule pings are sent without the AI, so save them as assistant-only turns too.
const PING_SAVE = 'Save Schedule Ping Turn';
wf.nodes = wf.nodes.filter(n => n.name !== PING_SAVE);
const ping = byName('Send Schedule Ping');
wf.nodes.push({
  ...JSON.parse(JSON.stringify(save)),
  id: 'ckm00001-0000-4000-8000-000000000001',
  name: PING_SAVE,
  position: [ping.position[0] + 224, ping.position[1]],
  parameters: {
    ...JSON.parse(JSON.stringify(save.parameters)),
    jsonBody: `={{ JSON.stringify({ p_chat_id: '${CHAT_ID}', p_user_text: null, p_assistant_text: $('Format Schedule Ping').item.json.text }) }}`
  }
});
wf.connections['Send Schedule Ping'] = { main: [[{ node: PING_SAVE, type: 'main', index: 0 }]] };

// B. Prompt rule.
const agent = byName('AI Agent');
let prompt = agent.parameters.options.systemMessage;
const anchor = "- History may include scheduled check-ins and their own replies mixed in with real back-and-forth with Mark";
const rule = `- REPLYING TO A CHECK-IN OR PING: when the newest message answers your most recent check-in or schedule ping in history (e.g. "z, nothing, dan nothing"), match each comma/line-separated part of Mark's reply to the questions in that check-in, in order. Handle EVERY part: log whatever is loggable, and confirm each one in your reply under its section - including "nothing"/"no"/"none" answers (e.g. "- No new food since 2" under #### Health, "- Dan Carlin Part 4: no change, still 1:42h of 4h1m" under #### Learned). Never silently drop a part; this overrides "reply with only the sections that changed". If you genuinely can't tell what a part refers to, say so in one short line and ask, instead of skipping it.`;
if (!prompt.includes('REPLYING TO A CHECK-IN OR PING')) {
  const i = prompt.indexOf(anchor);
  if (i < 0) throw new Error('prompt anchor not found - aborting');
  const eol = prompt.indexOf('\n', i);
  prompt = prompt.slice(0, eol + 1) + rule + '\n' + prompt.slice(eol + 1);
  agent.parameters.options.systemMessage = prompt;
}

const out = api('PUT', `/workflows/${MAIN_ID}`, { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings });
const o = n => out.nodes.find(x => x.name === n);
console.log('Saved. nodes:', out.nodes.length, '| active:', out.active, '| errorWorkflow:', out.settings.errorWorkflow);
console.log('chat fallback:', o('Save Conversation Turn').parameters.jsonBody.includes(newChat));
console.log('ping save wired:', JSON.stringify(out.connections['Send Schedule Ping']));
console.log('prompt rule:', o('AI Agent').parameters.options.systemMessage.includes('REPLYING TO A CHECK-IN OR PING'));
