require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_prio1.json`);

const d = JSON.parse(fs.readFileSync('workflow_prio1.json', 'utf8'));
const agent = d.nodes.find(n => n.name === 'AI Agent');
let prompt = agent.parameters.options.systemMessage;

const marker = 'Your job: Health (sleep, food, gym), Personal Finance (spending), Start Up (build/plan hours, proof), and Mood - plus the scheduled check-ins and /today, /form.';

const addition = `${marker}

CLASSIFY BY CONTENT FIRST, always. A message with its own specific content (a dollar amount, a food/drink mentioned, "slept"/hours, "gym"/a workout, a mood number, build/plan hours) is ALWAYS that category, regardless of what else might be pending - e.g. "14 chipotle" or "$14" is a purchase even if a schedule item is also overdue; "slept 7h" is Health even if Finance has a pending item. The "assume the most recent thing" shortcut (used for schedule's x/z/done/yes/no) ONLY applies to short, content-free acknowledgments that carry no specific information of their own and could genuinely be answering more than one open thing - never let it override a message that clearly belongs to a different category by its content.`;

if (!prompt.includes(marker)) {
  console.log('MARKER NOT FOUND - aborting');
  process.exit(1);
}
prompt = prompt.replace(marker, addition);
agent.parameters.options.systemMessage = prompt;
console.log('priority rule added:', prompt.includes('CLASSIFY BY CONTENT FIRST'));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_prio1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
