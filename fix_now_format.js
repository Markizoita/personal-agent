const fs = require('fs');
const d = JSON.parse(fs.readFileSync('workflow_check.json', 'utf8'));

const a = d.nodes.find(n => n.name === 'Build Wake Reply Context');
a.parameters.jsCode = a.parameters.jsCode.replace("$now.format('yyyy-MM-dd')", "$now.toFormat('yyyy-MM-dd')");

const b = d.nodes.find(n => n.name === 'Build Wake Passage Context');
b.parameters.jsCode = b.parameters.jsCode.replace("$now.format('yyyy-MM-dd')", "$now.toFormat('yyyy-MM-dd')");

console.log('a fixed:', a.parameters.jsCode.includes('toFormat'));
console.log('b fixed:', b.parameters.jsCode.includes('toFormat'));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_wake2.json', JSON.stringify(payload));
console.log('built, nodeCount:', payload.nodes.length);
