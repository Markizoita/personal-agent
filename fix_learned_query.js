require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_lquery1.json`);

const d = JSON.parse(fs.readFileSync('workflow_lquery1.json', 'utf8'));
const agent = d.nodes.find(n => n.name === 'AI Agent');
let prompt = agent.parameters.options.systemMessage;

const marker = '"bookmarks" or "/bookmarks": call get_bookmarks,';
const addition = `Just asking where he left off ("where did I leave off on atomic habits", "what page am I on", "where am I in mfm"), with no new progress mentioned: call find_learned_item, report the current position only ("📖 Atomic Habits · p. 85 of 320" or similar) - do NOT call update_learned_progress, nothing changed.

"bookmarks" or "/bookmarks": call get_bookmarks,`;

if (!prompt.includes(marker)) {
  console.log('MARKER NOT FOUND - aborting');
  process.exit(1);
}
prompt = prompt.replace(marker, addition);
agent.parameters.options.systemMessage = prompt;
console.log('query-only instruction added:', prompt.includes('where did I leave off on atomic habits'));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_lquery1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
