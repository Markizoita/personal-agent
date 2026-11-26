require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_fixstop1.json`);

const d = JSON.parse(fs.readFileSync('workflow_fixstop1.json', 'utf8'));
const node = d.nodes.find(n => n.name === 'Format Stop Recap');
if (!node) { console.log('NODE NOT FOUND'); process.exit(1); }

node.parameters.jsCode =
  "const wasRunning = $('Call stop_startup_session (button)').first().json.ok;\n" +
  "const m = $json.minutes; const h = Math.floor(m/60); const mm = m%60; const label = h>0 ? (h+'h '+mm+'m') : (mm+'m');\n" +
  "const resultLine = $json.result === 'Win' ? '✅ Win' : $json.result === 'Showed up' ? 'Showed up' : $json.result === 'Miss' ? 'Miss' : $json.result;\n" +
  "const head = wasRunning ? '⏹ Stopped.' : 'Nothing was running.';\n" +
  "const text = head + ' ' + label + ' logged today.\\nResult: ' + resultLine + ' (goal ' + Math.floor($json.goal/60) + 'h) · Level ' + $json.level + ' · XP +' + $json.xp;\n" +
  "return [{ json: { text } }];";

console.log('wording fixed:', node.parameters.jsCode.includes('Nothing was running'));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_fixstop1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
