// Adds a /tweak command to the Telegram bot. "/tweak <note>" (optionally sent
// as a reply to one of the bot's messages) saves the note to the Supabase
// `tweaks` table and confirms. Open tweaks are then reviewed in Claude Code.
// Run tweaks_sql.sql in the Supabase SQL editor FIRST, or /tweak will fail
// (the Error Watcher would alert). Safe to re-run.
require('./env');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const BASE = 'https://bot.marizo.site/api/v1';
const KEY = process.env.N8N_API_KEY;
const MAIN_ID = 'lULFqqQFMNb8byt2';

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
fs.writeFileSync('workflow_before_tweak.json', JSON.stringify(wf, null, 2));
const byName = n => wf.nodes.find(x => x.name === n);

// Reuse the Supabase + Telegram settings already in the workflow (no secrets in the repo).
const sbNode = byName('Log Pending Purchase');
const sbUrl = sbNode.parameters.url.replace(/\/rest\/v1\/.*/, '');
const sbHeaders = sbNode.parameters.headerParameters.parameters.filter(h => h.name !== 'Prefer');
const tgUrl = byName('Send Start Reply').parameters.url;

// Remove any previous copy of these nodes (re-run safety).
const NAMES = ['Is Tweak?', 'Save Tweak', 'Confirm Tweak'];
wf.nodes = wf.nodes.filter(n => !NAMES.includes(n.name));
for (const n of NAMES) delete wf.connections[n];

const isTweak = {
  id: 'tw000001-0000-4000-8000-000000000001', name: 'Is Tweak?',
  type: 'n8n-nodes-base.if', typeVersion: 2.2, position: [48, -480],
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 1 },
      conditions: [{
        id: 'tw1',
        leftValue: "={{ ($json.message?.text || '').trim().toLowerCase() }}",
        rightValue: '/tweak',
        operator: { type: 'string', operation: 'startsWith' }
      }],
      combinator: 'and'
    },
    options: {}
  }
};

const saveTweak = {
  id: 'tw000002-0000-4000-8000-000000000002', name: 'Save Tweak',
  type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [272, -560],
  retryOnFail: true, maxTries: 3, waitBetweenTries: 2000,
  parameters: {
    method: 'POST',
    url: `${sbUrl}/rest/v1/tweaks`,
    sendHeaders: true,
    headerParameters: { parameters: [...sbHeaders, { name: 'Prefer', value: 'return=representation' }] },
    sendBody: true, specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ note: ($json.message.text || '').trim().replace(/^\\/tweak(@\\w+)?\\s*/i, '') || '(no note - see context)', context: $json.message.reply_to_message?.text || $json.message.reply_to_message?.caption || null }) }}",
    options: {}
  }
};

const confirmTweak = {
  id: 'tw000003-0000-4000-8000-000000000003', name: 'Confirm Tweak',
  type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [496, -560],
  retryOnFail: true, maxTries: 3, waitBetweenTries: 2000,
  parameters: {
    method: 'POST', url: tgUrl,
    sendHeaders: true, headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }] },
    sendBody: true, specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ chat_id: $('Telegram Trigger').item.json.message.chat.id, reply_to_message_id: $('Telegram Trigger').item.json.message.message_id, rich_message: { markdown: '📝 Tweak #' + $json.id + ' noted' + ($json.context ? ' (with the message you replied to)' : '') + \". We'll go through it in Claude.\" } }) }}",
    options: {}
  }
};

wf.nodes.push(isTweak, saveTweak, confirmTweak);
const oldTarget = wf.connections['Telegram Trigger'].main[0].find(c => c.node !== 'Is Tweak?')
  || { node: 'Is Start Button?', type: 'main', index: 0 };
wf.connections['Telegram Trigger'] = { main: [[{ node: 'Is Tweak?', type: 'main', index: 0 }]] };
wf.connections['Is Tweak?'] = { main: [[{ node: 'Save Tweak', type: 'main', index: 0 }], [oldTarget]] };
wf.connections['Save Tweak'] = { main: [[{ node: 'Confirm Tweak', type: 'main', index: 0 }]] };

const out = api('PUT', `/workflows/${MAIN_ID}`, { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings });
console.log('Saved. nodes:', out.nodes.length, '| active:', out.active, '| trigger ->', JSON.stringify(out.connections['Telegram Trigger'].main[0]));
