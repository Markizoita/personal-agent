require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_foldin1.json`);

const d = JSON.parse(fs.readFileSync('workflow_foldin1.json', 'utf8'));
const agent = d.nodes.find(n => n.name === 'AI Agent');
let prompt = agent.parameters.options.systemMessage;

const FOLDIN = ' MANDATORY, every time: also scan schedule_items for any item still \'pending\' whose check_at has already passed, and add one line asking about EACH one, worded exactly like a schedule ping ("<title>, <start>-<end>: done? ✅ or tell me what happened") - never skip this check, even when nothing else is missing.';

const oldBlock = `- Also check schedule_items: for any item that is still 'pending' and whose check_at has already passed, add one line asking about it the same way a schedule ping would ("<title>, <start>-<end>: done? ✅ or tell me what happened") - this is how overdue schedule checks get folded in instead of pinging separately.
- 8 AM: ask "sleep last night? · breakfast?" unless both already logged (then state them instead).
- 2 PM: ask "food since 8?" unless already answered since 8am.
- 5 PM: same shape as 2 PM, "food since 2?".
- 10 PM Breakdown: ask only for whichever of these is still missing - food since 5 PM, gym ✅/⬜, Start Up hours + proof, mood 0-10, and any still-pending schedule item whose check_at has passed (same fold-in line as above). Then, regardless of what was missing, show the WHOLE form:`;

const newBlock = `- 8 AM: ask "sleep last night? · breakfast?" unless both already logged (then state them instead).${FOLDIN}
- 2 PM: ask "food since 8?" unless already answered since 8am.${FOLDIN}
- 5 PM: same shape as 2 PM, "food since 2?".${FOLDIN}
- 10 PM Breakdown: ask only for whichever of these is still missing - food since 5 PM, gym ✅/⬜, Start Up hours + proof, mood 0-10.${FOLDIN} Then, regardless of what was missing, show the WHOLE form:`;

if (!prompt.includes(oldBlock)) {
  console.log('OLD BLOCK NOT FOUND - aborting');
  process.exit(1);
}
prompt = prompt.replace(oldBlock, newBlock);
agent.parameters.options.systemMessage = prompt;
console.log('foldin inlined count:', (prompt.match(/MANDATORY, every time/g) || []).length);

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_foldin1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
