require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_fmt2.json`);

const d = JSON.parse(fs.readFileSync('workflow_fmt2.json', 'utf8'));
const agent = d.nodes.find(n => n.name === 'AI Agent');
let prompt = agent.parameters.options.systemMessage;

const marker1 = `Reply with: "🎧 <title> · <current as h:mm> of <total as h:mm>" (podcast) or "📖 <title> · p. <current> of <total>" (book).`;
const replacement1 = `Reply with: "🎧 <title> · <current as H:MMh> of <total as XhYm>" (podcast) or "📖 <title> · p. <current> of <total>" (book). The total is never "what's left" - it's always the full length, so format it compact and unambiguous: for 241 total minutes, that's "4h1m", not "4h01m" or "0h 4h 1m". For current, use H:MMh - 102 minutes is "1:42h". Worked example: current 102 min, total 241 min -> "🎧 Dan Carlin Part 4 · 1:42h of 4h1m".`;
if (!prompt.includes(marker1)) { console.log('MARKER1 NOT FOUND'); process.exit(1); }
prompt = prompt.replace(marker1, replacement1);

const marker2 = `Reply with the corrected "<current> of <total>" line.`;
const replacement2 = `Reply with the corrected line, same format as above: "🎧 <title> · <current as H:MMh> of <total as XhYm>".`;
if (!prompt.includes(marker2)) { console.log('MARKER2 NOT FOUND'); process.exit(1); }
prompt = prompt.replace(marker2, replacement2);

const marker3 = `"bookmarks" or "/bookmarks": call get_bookmarks, reply with one line per in-progress item: "🎧/📖 <title> · <current> of <total> · <last_updated_label>".`;
const replacement3 = `"bookmarks" or "/bookmarks": call get_bookmarks, reply with one line per in-progress item, same current/total format as above: "🎧/📖 <title> · <current as H:MMh or p. N> of <total as XhYm or N> · <last_updated_label>".`;
if (!prompt.includes(marker3)) { console.log('MARKER3 NOT FOUND'); process.exit(1); }
prompt = prompt.replace(marker3, replacement3);

agent.parameters.options.systemMessage = prompt;
console.log('m1:', prompt.includes('1:42h of 4h1m'));
console.log('m2:', prompt.includes('same format as above: "🎧 <title> · <current as H:MMh> of <total as XhYm>"'));
console.log('m3:', prompt.includes('<current as H:MMh or p. N> of <total as XhYm or N>'));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_fmt2.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
