const fs = require('fs');
const d = JSON.parse(fs.readFileSync('workflow_v16.json', 'utf8'));

const removeNames = [
  'Chat Webhook', 'Respond to Chat',
  'Save Daily Breakdown', 'Save Weekly Breakdown', 'Save Monthly Breakdown'
];

d.nodes = d.nodes.filter(n => !removeNames.includes(n.name));
for (const name of removeNames) delete d.connections[name];

// AI Agent's output: drop the "Respond to Chat" target, keep "Send a text message"
d.connections['AI Agent'].main[0] = d.connections['AI Agent'].main[0].filter(c => c.node !== 'Respond to Chat');

// Format nodes: drop the "Save ... Breakdown" fan-out, keep the Telegram Send
d.connections['Format Daily'].main[0] = d.connections['Format Daily'].main[0].filter(c => c.node !== 'Save Daily Breakdown');
d.connections['Format Weekly'].main[0] = d.connections['Format Weekly'].main[0].filter(c => c.node !== 'Save Weekly Breakdown');
d.connections['Format Monthly'].main[0] = d.connections['Format Monthly'].main[0].filter(c => c.node !== 'Save Monthly Breakdown');

// Simplify back to Telegram-only input now that the web chat path is gone
const agent = d.nodes.find(n => n.name === 'AI Agent');
agent.parameters.text = '={{ $json.message.text }}';

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow18.json', JSON.stringify(payload));
console.log('built, nodeCount:', payload.nodes.length);
console.log(payload.nodes.map(n => n.name).join(', '));
