const fs = require('fs');
const d = JSON.parse(fs.readFileSync('workflow_v9.json', 'utf8'));

const codeNodeNames = {
  'Format Daily': 'Daily spending recap:',
  'Format Weekly': 'Weekly spending recap (last 7 days):',
  'Format Monthly': 'Monthly spending recap:'
};

for (const [name, label] of Object.entries(codeNodeNames)) {
  const node = d.nodes.find(n => n.name === name);
  node.parameters.jsCode =
`const items = $input.all().map(i => i.json);
const total = items.reduce((sum, r) => sum + Number(r.amount), 0);
const lines = items.map(r => \`- \${r.merchant || 'Unknown'}: $\${Number(r.amount).toFixed(2)}\`).join('\\n');
const text = \`${label}\\nTotal spent: $\${total.toFixed(2)}\\nTotal purchases: \${items.length}\\n\${lines || '(nothing logged)'}\`;
return [{ json: { text } }];`;
}

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow11.json', JSON.stringify(payload));
console.log('updated', Object.keys(codeNodeNames).length, 'code nodes');
