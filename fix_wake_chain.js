require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_latest3.json`);

const d = JSON.parse(fs.readFileSync('workflow_latest3.json', 'utf8'));
const SB_URL = 'https://hzwmypoifzazhekzbpos.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

function sbHeaders(extra) {
  return { parameters: [
    { name: 'apikey', value: SB_KEY },
    { name: 'Authorization', value: 'Bearer ' + SB_KEY },
    ...(extra || [])
  ] };
}

// Remove reset_wake_day_for_test as an agent tool (keep node, disconnect from Wake Agent later we'll just delete it)
d.nodes = d.nodes.filter(n => n.name !== 'reset_wake_day_for_test');
delete d.connections['reset_wake_day_for_test'];

// New deterministic node: runs reset_wake_day_for_test via plain HTTP Request, only reached for /testwake
const isTestwakeCommand = {
  parameters: {
    conditions: {
      options: { caseSensitive: false, leftValue: '', typeValidation: 'strict', version: 1 },
      conditions: [
        {
          id: 'cond1',
          leftValue: "={{ /^\\/testwake\\b/i.test($('Telegram Trigger').item.json.message.text || '') ? 1 : 0 }}",
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
  position: [480, -176],
  id: 'ww000001-0001-4000-8000-000000000017',
  name: 'Is Testwake Command?'
};

const resetWakeDayDeterministic = {
  parameters: {
    method: 'POST',
    url: SB_URL + '/rest/v1/rpc/reset_wake_day_for_test',
    sendHeaders: true,
    headerParameters: sbHeaders([{ name: 'Content-Type', value: 'application/json' }]),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ p_log_date: $now.toFormat('yyyy-MM-dd') }) }}",
    options: {}
  },
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [672, -220],
  id: 'ww000001-0001-4000-8000-000000000018',
  name: 'Reset Wake Day (deterministic)',
  retryOnFail: true,
  maxTries: 3,
  waitBetweenTries: 2000
};

d.nodes.push(isTestwakeCommand, resetWakeDayDeterministic);

// Rewire: Route to Wake? true -> Is Testwake Command? -> [true: Reset Wake Day (deterministic) -> Build Wake Reply Context, false: Build Wake Reply Context]
d.connections['Route to Wake?'] = {
  main: [
    [{ node: 'Is Testwake Command?', type: 'main', index: 0 }],
    [{ node: 'AI Agent', type: 'main', index: 0 }]
  ]
};
d.connections['Is Testwake Command?'] = {
  main: [
    [{ node: 'Reset Wake Day (deterministic)', type: 'main', index: 0 }],
    [{ node: 'Build Wake Reply Context', type: 'main', index: 0 }]
  ]
};
d.connections['Reset Wake Day (deterministic)'] = { main: [[{ node: 'Build Wake Reply Context', type: 'main', index: 0 }]] };

// Update Wake Agent prompt: remove reset_wake_day_for_test tool-call instruction for /testwake
const agent = d.nodes.find(n => n.name === 'Wake Agent');
agent.parameters.options.systemMessage = agent.parameters.options.systemMessage.replace(
  '## /testwake command\nCall reset_wake_day_for_test exactly once, then follow "Generating a passage" above starting at step 1.',
  '## /testwake command\nToday\'s entry has already been cleared for you before you were called. Just follow "Generating a passage" above starting at step 1.'
);

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_wake5.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
console.log('prompt updated:', agent.parameters.options.systemMessage.includes('already been cleared'));
