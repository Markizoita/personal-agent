require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_sched6.json`);

const d = JSON.parse(fs.readFileSync('workflow_sched6.json', 'utf8'));
const agent = d.nodes.find(n => n.name === 'AI Agent');
let prompt = agent.parameters.options.systemMessage;

const marker = `- "done", "yes", "y", "👍" -> p_status 'done', no p_what_happened.`;
const replacement = `- "done", "yes", "y", "z", "👍" -> p_status 'done', no p_what_happened.`;

if (!prompt.includes(marker)) {
  console.log('MARKER NOT FOUND - aborting');
  process.exit(1);
}
prompt = prompt.replace(marker, replacement);

const marker2 = `re-interpreting raw_reply the same way you normally would ('done'/'yes'/'👍' -> status 'done'; "x"/"n"/"no"/"nope" -> status 'skipped'; anything else -> 'partly' or 'skipped' with p_what_happened set to raw_reply)`;
const replacement2 = `re-interpreting raw_reply the same way you normally would ('done'/'yes'/'z'/'👍' -> status 'done'; "x"/"n"/"no"/"nope" -> status 'skipped'; anything else -> 'partly' or 'skipped' with p_what_happened set to raw_reply)`;
if (!prompt.includes(marker2)) {
  console.log('MARKER2 NOT FOUND - aborting');
  process.exit(1);
}
prompt = prompt.replace(marker2, replacement2);

agent.parameters.options.systemMessage = prompt;
console.log('z shortcut added:', prompt.includes('"z", "👍"'));
console.log('z shortcut added to clarification text:', prompt.includes("'yes'/'z'/'👍'"));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_schedule6.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
