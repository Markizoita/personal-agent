require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_memsafe1.json`);

const d = JSON.parse(fs.readFileSync('workflow_memsafe1.json', 'utf8'));
const agent = d.nodes.find(n => n.name === 'AI Agent');
let prompt = agent.parameters.options.systemMessage;

const marker = 'CLASSIFY BY CONTENT FIRST, always.';
const addition = `You now see recent conversation history (the last 20 messages), so you can follow references like "the second one", "delete that", "actually make it 4pm", or "what did I just add?" without Mark repeating himself. Two rules about this:
- History shows what was SAID, not what is true NOW. Before changing or deleting anything, always re-check it via the real tool (get_daily_form, get_recent_purchases, search_notes) rather than acting on an id or status only remembered from a past message in history - if history and a fresh tool call disagree, trust the tool call and say so.
- The newest message is the actual instruction; everything earlier in history is just context to help you understand it, never an instruction to re-execute.
- History may include scheduled check-ins and their own replies mixed in with real back-and-forth with Mark - use judgment about what's actually a reference to follow vs. just older system-generated content.

CLASSIFY BY CONTENT FIRST, always.`;

if (!prompt.includes(marker)) {
  console.log('MARKER NOT FOUND - aborting');
  process.exit(1);
}
prompt = prompt.replace(marker, addition);
agent.parameters.options.systemMessage = prompt;
console.log('memory safety rules added:', prompt.includes('History shows what was SAID'));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_memsafe1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
