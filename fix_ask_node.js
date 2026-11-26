const fs = require('fs');
const d = JSON.parse(fs.readFileSync('update_workflow7.json', 'utf8'));
const askNode = d.nodes.find(n => n.name === 'Ask what it was');
askNode.parameters.text =
  "={{ 'Noticed a purchase' + ($('Apple Pay Webhook').item.json.body.amount ? (' of $' + $('Apple Pay Webhook').item.json.body.amount) : '') + ($('Apple Pay Webhook').item.json.body.merchant ? (' at ' + $('Apple Pay Webhook').item.json.body.merchant) : '') + ' — what was it?' }}";
fs.writeFileSync('update_workflow8.json', JSON.stringify(d));
console.log('new text:', askNode.parameters.text);
