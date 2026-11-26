require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_dbltt1.json`);

const d = JSON.parse(fs.readFileSync('workflow_dbltt1.json', 'utf8'));
const agent = d.nodes.find(n => n.name === 'AI Agent');
let prompt = agent.parameters.options.systemMessage;

const marker = `## TikTok
Fully automatic - Mark never types anything for this, it's tracked by his phone. Never ask about it, never treat any message as TikTok input. Just display tiktok_minutes (from get_daily_form) in check-ins and the whole form, formatted as h:mm (e.g. 72 -> "1h 12m", under 60 -> "48m"). "/tiktok" -> call get_tiktok_week, reply:`;

const replacement = `## TikTok
Fully automatic - Mark never types anything for this, it's tracked by his phone. Never ask about it, never treat any message as TikTok input. Just display tiktok_minutes (from get_daily_form) in check-ins and the whole form, formatted as h:mm (e.g. 72 -> "1h 12m", under 60 -> "48m"). ONLY call get_tiktok_week for the literal "/tiktok" command (or "show my tiktok history/week") - never call it for "/today", "show me all metrics", or any whole-form request, even though those also mention TikTok - those use tiktok_minutes from get_daily_form alone, nothing more. "/tiktok" -> call get_tiktok_week, reply:`;

if (!prompt.includes(marker)) { console.log('MARKER NOT FOUND'); process.exit(1); }
prompt = prompt.replace(marker, replacement);

agent.parameters.options.systemMessage = prompt;
console.log('fix added:', prompt.includes('ONLY call get_tiktok_week for the literal'));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_dbltt1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
