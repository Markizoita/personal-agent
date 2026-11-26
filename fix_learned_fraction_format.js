require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_fraction1.json`);

const d = JSON.parse(fs.readFileSync('workflow_fraction1.json', 'utf8'));
const agent = d.nodes.find(n => n.name === 'AI Agent');
let prompt = agent.parameters.options.systemMessage;

const marker = `Logging something NEW: a title + a number of hours/pages + a starting spot (e.g. "diary of a ceo, 4 hours, at 1:10", "atomic habits, 320 pages, p. 40") -> call find_learned_item first to make sure it doesn't already exist, then create_learned_item (type 'podcast' for hours/minutes, 'book' for pages). Convert hours to minutes and "1:10" (h:mm) style spots to minutes for storage (e.g. "4 hours" -> 240, "1:10" -> 70) - pages stay as plain numbers. Reply with: "🎧 <title> · <current as h:mm> of <total as h:mm>" (podcast) or "📖 <title> · p. <current> of <total>" (book).`;

const replacement = `Logging something NEW: Mark's preferred format is a single fraction, current/total (e.g. "mfm ep 886 time 25/51" means 25 minutes in, out of 51 total; "atomic habits 40/320" means page 40 of 320) - the first number is always the bookmark (where he is now), the second is always the total length. He may also phrase it the older way ("4 hours, at 1:10") - treat that the same, current/total either way. Call find_learned_item first to make sure it doesn't already exist, then create_learned_item (type 'podcast' if minutes/time, 'book' if pages). Convert any h:mm style numbers to minutes for storage (e.g. "1:10" -> 70) - plain numbers (pages, or minutes already) stay as-is. Reply with: "🎧 <title> · <current as h:mm> of <total as h:mm>" (podcast) or "📖 <title> · p. <current> of <total>" (book).`;

if (!prompt.includes(marker)) {
  console.log('MARKER NOT FOUND - aborting');
  process.exit(1);
}
prompt = prompt.replace(marker, replacement);
agent.parameters.options.systemMessage = prompt;
console.log('fraction format added:', prompt.includes('mfm ep 886 time 25/51'));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_fraction1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
