require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_heading1.json`);

const d = JSON.parse(fs.readFileSync('workflow_heading1.json', 'utf8'));
const agent = d.nodes.find(n => n.name === 'AI Agent');
let prompt = agent.parameters.options.systemMessage;

const marker = 'Reply with ONLY: "📝 Saved #<id> · <tags, comma separated>" - nothing else, no commentary.';
const replacement = `Reply with ONLY this shape, nothing else, no commentary - the note text itself as a markdown heading (## level, so it renders large immediately) followed by the short confirmation:
## <the note text, exactly as saved>
📝 Saved #<id> · <tags, comma separated>`;

if (!prompt.includes(marker)) {
  console.log('MARKER NOT FOUND - aborting');
  process.exit(1);
}
prompt = prompt.replace(marker, replacement);
agent.parameters.options.systemMessage = prompt;
console.log('heading format added:', prompt.includes('renders large immediately'));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_heading1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
