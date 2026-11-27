require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_detach1.json`);

const d = JSON.parse(fs.readFileSync('workflow_detach1.json', 'utf8'));

const REMOVE = [
  'Is Start Button?', 'Call start_startup_session (button)', 'Format Start Reply', 'Send Start Reply',
  'Is Stop Button?', 'Call stop_startup_session (button)', 'Call finalize_startup_day (on stop)', 'Format Stop Recap', 'Send Stop Recap',
  'Check Startup 9am', 'Is 9am Nudge Due?', 'Send 9am Nudge',
  'Check Startup Wrapup', 'Is Wrapup Due?', 'Call finalize_startup_day (wrap-up)', 'Format Wrapup Recap', 'Send Wrapup Recap',
  'start_startup_session', 'stop_startup_session', 'add_startup_todo', 'complete_startup_todo', 'log_startup_proof',
  'log_game_task', 'undo_game_task', 'get_game_state'
];

const beforeCount = d.nodes.length;
d.nodes = d.nodes.filter(n => !REMOVE.includes(n.name));
REMOVE.forEach(n => delete d.connections[n]);
console.log('removed nodes:', beforeCount - d.nodes.length, '(expected', REMOVE.length, ')');

// Rewire: Is Tweak?'s false branch skipped the button chain straight to Check Wake Routing;
// point it there directly now that the button nodes are gone.
d.connections['Is Tweak?'] = { main: [
  d.connections['Is Tweak?'].main[0],
  [{ node: 'Check Wake Routing', type: 'main', index: 0 }]
] };

// Schedule Poll: drop the two removed fan-out targets, keep the rest.
const keep = d.connections['Schedule Poll'].main[0].filter(t => !['Check Startup 9am', 'Check Startup Wrapup'].includes(t.node));
d.connections['Schedule Poll'] = { main: [keep] };

// Revert the normal-reply send node to a plain message - no more persistent keyboard.
const mainSend = d.nodes.find(n => n.name === 'Send a text message');
mainSend.parameters.jsonBody = `={{ JSON.stringify({ chat_id: '${process.env.TELEGRAM_CHAT_ID}', rich_message: { markdown: $json.output } }) }}`;

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_detach1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
