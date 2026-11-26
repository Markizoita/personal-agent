require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_test1.json`);

const d = JSON.parse(fs.readFileSync('workflow_test1.json', 'utf8'));
const node = d.nodes.find(n => n.name === 'Build Normal Reply Context');

node.parameters.jsCode = `const msgText = $('Telegram Trigger').item.json.message.text || '';
const t = msgText.trim().toLowerCase();
if (t === '/test8am') {
  return [{ json: { context: "SYSTEM: 8 AM check-in. Follow the Scheduled check-ins instructions for 8 AM." } }];
}
if (t === '/test2pm') {
  return [{ json: { context: "SYSTEM: 2 PM check-in. Follow the Scheduled check-ins instructions for 2 PM." } }];
}
if (t === '/test5pm') {
  return [{ json: { context: "SYSTEM: 5 PM check-in. Follow the Scheduled check-ins instructions for 5 PM." } }];
}
if (t === '/testbreakdown') {
  return [{ json: { context: "SYSTEM: 10 PM Breakdown. Follow the Scheduled check-ins instructions for the 10 PM Breakdown." } }];
}
return [{ json: { context: msgText } }];`;

console.log('test triggers added:', node.parameters.jsCode.includes('/testbreakdown'));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_test1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
