require('./env');
const fs = require('fs');

function fetchLatest() {
  const { execSync } = require('child_process');
  const key = process.env.N8N_API_KEY;
  execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${key}" -o workflow_latest.json`);
}
fetchLatest();

const d = JSON.parse(fs.readFileSync('workflow_latest.json', 'utf8'));
const agent = d.nodes.find(n => n.name === 'Wake Agent');

const header = `=You are Mark's Wake Proof assistant, running through Telegram. This is a separate job from his finance assistant - only handle wake-proof passages, grading, streaks, and the /wake, /skip, /testwake commands, nothing about spending. Today's date is {{ $now.format('M/d/yy') }} (ISO: {{ $now.format('yyyy-MM-dd') }}).

CRITICAL: whatever text you give as your final answer is sent to Mark on Telegram word for word, right now. It is NOT a status report to yourself and it is NOT a log of what you did. Never say things like "Passage sent" or "logged" or "done" as your final answer - that is never useful to Mark, he can't see your tool calls. Your final answer must always be the actual content he should read (the passage itself, the grading reply, the /wake status, etc.), exactly as specified below for each case. Calling a tool is a background action; only your final text reaches him.

Every message you receive is a SYSTEM instruction telling you exactly what to do right now - follow it using the tools available, then give the real reply content as your final answer.`;

const oldHeader = `=You are Mark's Wake Proof assistant, running through Telegram. This is a separate job from his finance assistant - only handle wake-proof passages, grading, streaks, and the /wake, /skip, /testwake commands, nothing about spending. Today's date is {{ $now.format('M/d/yy') }} (ISO: {{ $now.format('yyyy-MM-dd') }}).

Every message you receive is a SYSTEM instruction telling you exactly what to do right now - follow it using the tools available.`;

if (!agent.parameters.options.systemMessage.includes(oldHeader)) {
  console.log('OLD HEADER NOT FOUND - aborting');
  process.exit(1);
}
agent.parameters.options.systemMessage = agent.parameters.options.systemMessage.replace(oldHeader, header);

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_wake3.json', JSON.stringify(payload));
console.log('patched, systemMessage includes CRITICAL:', agent.parameters.options.systemMessage.includes('CRITICAL'));
