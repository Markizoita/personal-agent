require('./env');
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('workflow_v15.json', 'utf8'));

const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const hasAmount = {
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{
        id: 'cond1',
        leftValue: "={{ $json.body.amount ? 1 : 0 }}",
        rightValue: '={{ 1 }}',
        operator: { type: 'number', operation: 'equals' }
      }],
      combinator: 'and'
    },
    options: {}
  },
  type: 'n8n-nodes-base.if',
  typeVersion: 2.2,
  position: [48, 320],
  id: 'c9d8e7f6-0001-4000-8000-000000000001',
  name: 'Has Amount?'
};

const askNoAmount = {
  parameters: {
    chatId: CHAT_ID,
    text: "={{ 'Noticed an Apple Pay purchase' + ($('Apple Pay Webhook').item.json.body.merchant ? (' at ' + $('Apple Pay Webhook').item.json.body.merchant) : '') + \" — didn't catch the amount this time, what was it and how much?\" }}",
    additionalFields: {}
  },
  type: 'n8n-nodes-base.telegram',
  typeVersion: 1.2,
  position: [240, 480],
  id: 'c9d8e7f6-0002-4000-8000-000000000002',
  name: 'Ask what it was (no amount)',
  credentials: { telegramApi: { id: '8H0hBfrPobhcvfBu', name: 'Telegram account' } }
};

d.nodes.push(hasAmount, askNoAmount);

// Rewire: Apple Pay Webhook -> Has Amount? -> (true) Log Pending Purchase -> Ask what it was
//                                           -> (false) Ask what it was (no amount)
d.connections['Apple Pay Webhook'] = { main: [[{ node: 'Has Amount?', type: 'main', index: 0 }]] };
d.connections['Has Amount?'] = {
  main: [
    [{ node: 'Log Pending Purchase', type: 'main', index: 0 }],
    [{ node: 'Ask what it was (no amount)', type: 'main', index: 0 }]
  ]
};

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow17.json', JSON.stringify(payload));
console.log('built, nodeCount:', payload.nodes.length);
