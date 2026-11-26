require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_headings1.json`);

const d = JSON.parse(fs.readFileSync('workflow_headings1.json', 'utf8'));
const agent = d.nodes.find(n => n.name === 'AI Agent');
let prompt = agent.parameters.options.systemMessage;

const replacements = [
  ['\n**Health**\n', '\n#### Health\n'],
  ['\n**Finance**\n', '\n#### Finance\n'],
  ['\n**Start Up**\n', '\n#### Start Up\n'],
  ['\n**8 AM check-in**\n', '\n#### 8 AM check-in\n'],
  ['\n**2 PM check-in**\n', '\n#### 2 PM check-in\n'],
  ['\n**Schedule** (<date>)\n', '\n#### Schedule (<date>)\n'],
];

for (const [from, to] of replacements) {
  if (!prompt.includes(from)) {
    console.log('NOT FOUND:', JSON.stringify(from));
    process.exit(1);
  }
  prompt = prompt.split(from).join(to);
}

agent.parameters.options.systemMessage = prompt;
console.log('headings applied');

// Also inform the agent generally that section titles use #### everywhere, including Breakdown/Notes/Wake-shared sections
const marker = 'Your replies are sent as a Telegram Rich Message using Markdown, so use real markdown: **bold** for emphasis, *italic* for section context, "- " for bullets.';
const replacement = `Your replies are sent as a Telegram Rich Message using Markdown, so use real markdown: **bold** for emphasis, *italic* for section context, "- " for bullets, and "#### " at the start of a line for a section title (Health, Finance, Start Up, Schedule, a check-in's own title like "8 AM check-in") so it renders a bit larger/more prominent than the body text - apply this consistently to every section title you output, not just the examples shown below.`;

if (!prompt.includes(marker)) {
  console.log('MARKER (header) NOT FOUND - aborting');
  process.exit(1);
}
prompt = prompt.replace(marker, replacement);
agent.parameters.options.systemMessage = prompt;
console.log('general heading rule added:', prompt.includes('apply this consistently to every section title'));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_headings1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
