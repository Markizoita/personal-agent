require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_su1.json`);

const d = JSON.parse(fs.readFileSync('workflow_su1.json', 'utf8'));
const SB_URL = 'https://hzwmypoifzazhekzbpos.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

function sbHeaders(extra) {
  return { parameters: [
    { name: 'apikey', value: SB_KEY },
    { name: 'Authorization', value: 'Bearer ' + SB_KEY },
    ...(extra || [])
  ] };
}
const JSON_HEADER = { name: 'Content-Type', value: 'application/json' };

function httpTool(id, name, toolDescription, rpc, jsonBody, pos) {
  return {
    id, name, type: 'n8n-nodes-base.httpRequestTool', typeVersion: 4.5, position: pos,
    parameters: {
      toolDescription, method: 'POST', url: SB_URL + '/rest/v1/rpc/' + rpc,
      sendHeaders: true, headerParameters: sbHeaders([JSON_HEADER]),
      sendBody: true, specifyBody: 'json', jsonBody, options: {}
    }
  };
}
function httpCall(id, name, rpc, jsonBody, pos) {
  return {
    id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos,
    retryOnFail: true, maxTries: 3, waitBetweenTries: 2000,
    parameters: {
      method: 'POST', url: SB_URL + '/rest/v1/rpc/' + rpc,
      sendHeaders: true, headerParameters: sbHeaders([JSON_HEADER]),
      sendBody: true, specifyBody: 'json', jsonBody, options: {}
    }
  };
}
function sendTelegram(id, name, jsonBodyExpr, pos) {
  return {
    id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos,
    retryOnFail: true, maxTries: 3, waitBetweenTries: 2000,
    parameters: {
      method: 'POST', url: 'https://api.telegram.org/bot' + TG_TOKEN + '/sendRichMessage',
      sendHeaders: true, headerParameters: { parameters: [JSON_HEADER] },
      sendBody: true, specifyBody: 'json', jsonBody: jsonBodyExpr, options: {}
    }
  };
}
function ifEqualsText(id, name, expr, value, pos) {
  return {
    id, name, type: 'n8n-nodes-base.if', typeVersion: 2.2, position: pos,
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 1 },
        conditions: [{ id: 'c1', leftValue: expr, rightValue: value, operator: { type: 'string', operation: 'equals' } }],
        combinator: 'and'
      }, options: {}
    }
  };
}
function ifDue(id, name, pos) {
  return {
    id, name, type: 'n8n-nodes-base.if', typeVersion: 2.2, position: pos,
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 1 },
        conditions: [{ id: 'c1', leftValue: '={{ $json.due ? 1 : 0 }}', rightValue: '={{ 1 }}', operator: { type: 'number', operation: 'equals' } }],
        combinator: 'and'
      }, options: {}
    }
  };
}

const KEYBOARD = `, reply_markup: { keyboard: [["\\u25B6\\uFE0F Start work","\\u23F9 Stop work"]], resize_keyboard: true, is_persistent: true }`;

// ---------- 1. ai_tool nodes for the AI Agent ----------
const startTool = httpTool('su0001-tool-start', 'start_startup_session',
  "Starts my Start Up work timer. Call this when I type 'start <project>' or 'start' in plain text (the Start work button is handled separately, never by you).",
  'start_startup_session',
  "={{ JSON.stringify({ p_project: $fromAI('project', 'the project name, or empty string to continue the last project', 'string') }) }}",
  [4700, 320]);
const stopTool = httpTool('su0002-tool-stop', 'stop_startup_session',
  "Stops my Start Up work timer. Call this when I type 'stop' in plain text (the Stop work button is handled separately, never by you).",
  'stop_startup_session', '{}', [4900, 320]);
const addTodoTool = httpTool('su0003-tool-addtodo', 'add_startup_todo',
  "Adds a Start Up to-do. Call for 'todo: <project>: text' (day=today) or 'tomorrow: <project>: text' (day=tomorrow).",
  'add_startup_todo',
  "={{ JSON.stringify({ p_project: $fromAI('project', 'the project name', 'string'), p_text: $fromAI('text', 'the to-do text', 'string'), p_day: $fromAI('day', \"'today' or 'tomorrow'\", 'string'), p_tag: $fromAI('tag', \"'new' for today items, 'planned' for tomorrow items\", 'string') }) }}",
  [5100, 320]);
const completeTodoTool = httpTool('su0004-tool-donetodo', 'complete_startup_todo',
  "Marks a Start Up to-do done. Call for 'done <text or number>'.",
  'complete_startup_todo',
  "={{ JSON.stringify({ p_match: $fromAI('match', 'the to-do text or its number to mark done', 'string') }) }}",
  [5300, 320]);
const proofTool = httpTool('su0005-tool-proof', 'log_startup_proof',
  "Logs today's Start Up proof. Call this when I reply to a 'Goal hit. Proof?' prompt, or describe something I shipped or finished for Start Up work.",
  'log_startup_proof',
  "={{ JSON.stringify({ p_text: $fromAI('text', 'what I did as proof', 'string'), p_project: $fromAI('project', 'the project name, or empty string if unclear', 'string') }) }}",
  [5500, 320]);

d.nodes.push(startTool, stopTool, addTodoTool, completeTodoTool, proofTool);
['start_startup_session', 'stop_startup_session', 'add_startup_todo', 'complete_startup_todo', 'log_startup_proof'].forEach(n => {
  d.connections[n] = { ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]] };
});

// ---------- 2. Deterministic Start/Stop button branch, spliced before "Check Wake Routing" ----------
const isStartBtn = ifEqualsText('su0010-if-start', 'Is Start Button?', '={{ $json.message.text }}', '▶️ Start work', [96, -200]);
const callStart = httpCall('su0011-call-start', 'Call start_startup_session (button)', 'start_startup_session', '{"p_project":"Personal agent"}', [288, -260]);
const formatStartReply = {
  id: 'su0012-fmt-start', name: 'Format Start Reply', type: 'n8n-nodes-base.code', typeVersion: 2, position: [480, -260],
  parameters: { jsCode: "return [{ json: { text: '▶️ Started — ' + $json.project } }];" }
};
const sendStartReply = sendTelegram('su0013-send-start', 'Send Start Reply',
  `={{ JSON.stringify({ chat_id: '${CHAT_ID}', rich_message: { markdown: $json.text }${KEYBOARD} }) }}`, [672, -260]);

const isStopBtn = ifEqualsText('su0020-if-stop', 'Is Stop Button?', '={{ $json.message.text }}', '⏹ Stop work', [96, -80]);
const callStop = httpCall('su0021-call-stop', 'Call stop_startup_session (button)', 'stop_startup_session', '{}', [288, -140]);
const callFinalizeOnStop = httpCall('su0022-call-finalize-stop', 'Call finalize_startup_day (on stop)', 'finalize_startup_day', '{}', [480, -140]);
const formatStopRecap = {
  id: 'su0023-fmt-stop', name: 'Format Stop Recap', type: 'n8n-nodes-base.code', typeVersion: 2, position: [672, -140],
  parameters: {
    jsCode: "const m = $json.minutes; const h = Math.floor(m/60); const mm = m%60; const label = h>0 ? (h+'h '+mm+'m') : (mm+'m');\n" +
      "const resultLine = $json.result === 'Win' ? '✅ Win' : $json.result === 'Showed up' ? 'Showed up' : $json.result === 'Miss' ? 'Miss' : $json.result;\n" +
      "const text = '⏹ Stopped. ' + label + ' logged today.\\nResult: ' + resultLine + ' (goal ' + Math.floor($json.goal/60) + 'h) · Level ' + $json.level + ' · XP +' + $json.xp;\n" +
      "return [{ json: { text } }];"
  }
};
const sendStopRecap = sendTelegram('su0024-send-stop', 'Send Stop Recap',
  `={{ JSON.stringify({ chat_id: '${CHAT_ID}', rich_message: { markdown: $json.text }${KEYBOARD} }) }}`, [864, -140]);

d.nodes.push(isStartBtn, callStart, formatStartReply, sendStartReply, isStopBtn, callStop, callFinalizeOnStop, formatStopRecap, sendStopRecap);

const oldTriggerTarget = d.connections['Telegram Trigger'];
d.connections['Telegram Trigger'] = { main: [[{ node: 'Is Start Button?', type: 'main', index: 0 }]] };
d.connections['Is Start Button?'] = { main: [[{ node: 'Call start_startup_session (button)', type: 'main', index: 0 }], [{ node: 'Is Stop Button?', type: 'main', index: 0 }]] };
d.connections['Call start_startup_session (button)'] = { main: [[{ node: 'Format Start Reply', type: 'main', index: 0 }]] };
d.connections['Format Start Reply'] = { main: [[{ node: 'Send Start Reply', type: 'main', index: 0 }]] };
d.connections['Is Stop Button?'] = { main: [[{ node: 'Call stop_startup_session (button)', type: 'main', index: 0 }], oldTriggerTarget.main[0]] };
d.connections['Call stop_startup_session (button)'] = { main: [[{ node: 'Call finalize_startup_day (on stop)', type: 'main', index: 0 }]] };
d.connections['Call finalize_startup_day (on stop)'] = { main: [[{ node: 'Format Stop Recap', type: 'main', index: 0 }]] };
d.connections['Format Stop Recap'] = { main: [[{ node: 'Send Stop Recap', type: 'main', index: 0 }]] };

// ---------- 3. Schedule Poll fan-out: 9am no-start check + end-of-day wrap-up ----------
const checkStartup9am = httpCall('su0030-check9am', 'Check Startup 9am', 'check_startup_9am', '{}', [288, 3000]);
const is9amDue = ifDue('su0031-if9am', 'Is 9am Nudge Due?', [480, 3000]);
const send9amNudge = sendTelegram('su0032-send9am', 'Send 9am Nudge',
  `={{ JSON.stringify({ chat_id: '${CHAT_ID}', rich_message: { markdown: 'Not started at 9. What happened?' } }) }}`, [672, 3000]);

const checkWrapup = httpCall('su0040-checkwrap', 'Check Startup Wrapup', 'check_startup_wrapup_due', '{"p_end_time":"17:00"}', [288, 3100]);
const isWrapDue = ifDue('su0041-ifwrap', 'Is Wrapup Due?', [480, 3100]);
const callFinalizeWrap = httpCall('su0042-finwrap', 'Call finalize_startup_day (wrap-up)', 'finalize_startup_day', '{}', [672, 3100]);
const formatWrapRecap = {
  id: 'su0043-fmtwrap', name: 'Format Wrapup Recap', type: 'n8n-nodes-base.code', typeVersion: 2, position: [864, 3100],
  parameters: {
    jsCode: "const m = $json.minutes; const h = Math.floor(m/60); const mm = m%60; const label = h>0 ? (h+'h '+mm+'m') : (mm+'m');\n" +
      "const resultLine = $json.result === 'Win' ? '✅ Win' : $json.result === 'Showed up' ? 'Showed up' : $json.result === 'Miss' ? 'Miss' : $json.result;\n" +
      "const text = 'START UP · wrap-up\\n' + label + ' logged · goal ' + Math.floor($json.goal/60) + 'h\\nResult: ' + resultLine + ' · Level ' + $json.level + ' · XP +' + $json.xp + (!$json.has_proof ? '\\nNo proof logged yet — send it and I\\'ll update the result.' : '');\n" +
      "return [{ json: { text } }];"
  }
};
const sendWrapRecap = sendTelegram('su0044-sendwrap', 'Send Wrapup Recap',
  `={{ JSON.stringify({ chat_id: '${CHAT_ID}', rich_message: { markdown: $json.text } }) }}`, [1056, 3100]);

d.nodes.push(checkStartup9am, is9amDue, send9amNudge, checkWrapup, isWrapDue, callFinalizeWrap, formatWrapRecap, sendWrapRecap);

const pollExisting = d.connections['Schedule Poll'].main[0];
d.connections['Schedule Poll'] = { main: [[...pollExisting,
  { node: 'Check Startup 9am', type: 'main', index: 0 },
  { node: 'Check Startup Wrapup', type: 'main', index: 0 }
]] };
d.connections['Check Startup 9am'] = { main: [[{ node: 'Is 9am Nudge Due?', type: 'main', index: 0 }]] };
d.connections['Is 9am Nudge Due?'] = { main: [[{ node: 'Send 9am Nudge', type: 'main', index: 0 }], []] };
d.connections['Check Startup Wrapup'] = { main: [[{ node: 'Is Wrapup Due?', type: 'main', index: 0 }]] };
d.connections['Is Wrapup Due?'] = { main: [[{ node: 'Call finalize_startup_day (wrap-up)', type: 'main', index: 0 }], []] };
d.connections['Call finalize_startup_day (wrap-up)'] = { main: [[{ node: 'Format Wrapup Recap', type: 'main', index: 0 }]] };
d.connections['Format Wrapup Recap'] = { main: [[{ node: 'Send Wrapup Recap', type: 'main', index: 0 }]] };

// ---------- 4. Attach the persistent keyboard to every normal agent reply, so it's always visible ----------
const mainSend = d.nodes.find(n => n.name === 'Send a text message');
if (!mainSend) { console.log('MAIN SEND NODE NOT FOUND'); process.exit(1); }
mainSend.parameters.jsonBody = `={{ JSON.stringify({ chat_id: '${CHAT_ID}', rich_message: { markdown: $json.output }${KEYBOARD} }) }}`;

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_su1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
