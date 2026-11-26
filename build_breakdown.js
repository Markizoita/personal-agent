require('./env');
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('workflow_v8.json', 'utf8'));

const SB = 'https://hzwmypoifzazhekzbpos.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

function queryNode(id, name, pos, sinceExpr) {
  return {
    parameters: {
      method: 'GET',
      url: "={{ '" + SB + "/rest/v1/spending?select=amount,merchant,category&order=created_at.asc&created_at=gte.' + encodeURIComponent(" + sinceExpr + ") }}",
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: SB_KEY },
          { name: 'Authorization', value: 'Bearer ' + SB_KEY }
        ]
      },
      options: {}
    },
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: pos,
    id,
    name
  };
}

function codeNode(id, name, pos, label) {
  return {
    parameters: {
      jsCode:
`const items = $input.all().map(i => i.json);
const total = items.reduce((sum, r) => sum + Number(r.amount), 0);
const lines = items.map(r => \`- \${r.merchant || 'Unknown'}: $\${Number(r.amount).toFixed(2)}\`).join('\\n');
const text = \`${label}\\nTotal: $\${total.toFixed(2)}\\n\${lines || '(nothing logged)'}\`;
return [{ json: { text } }];`
    },
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: pos,
    id,
    name
  };
}

function telegramNode(id, name, pos) {
  return {
    parameters: {
      chatId: CHAT_ID,
      text: '={{ $json.text }}',
      additionalFields: {}
    },
    type: 'n8n-nodes-base.telegram',
    typeVersion: 1.2,
    position: pos,
    id,
    name,
    credentials: { telegramApi: { id: '8H0hBfrPobhcvfBu', name: 'Telegram account' } }
  };
}

function ifNode(id, name, pos, leftExpr, rightExpr) {
  return {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
        conditions: [{
          id: 'cond1',
          leftValue: '={{ ' + leftExpr + ' }}',
          rightValue: '={{ ' + rightExpr + ' }}',
          operator: { type: 'number', operation: 'equals' }
        }],
        combinator: 'and'
      },
      options: {}
    },
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position: pos,
    id,
    name
  };
}

const scheduleTrigger = {
  parameters: {
    rule: {
      interval: [{ field: 'cronExpression', expression: '0 22 * * *' }]
    }
  },
  type: 'n8n-nodes-base.scheduleTrigger',
  typeVersion: 1.2,
  position: [-96, 480],
  id: 'd1e2f3a4-0001-4000-8000-000000000001',
  name: 'Daily 10pm'
};

const dailyQuery = queryNode('d1e2f3a4-0002-4000-8000-000000000002', 'Query Today', [128, 400], "$now.startOf('day').toISO()");
const dailyCode = codeNode('d1e2f3a4-0003-4000-8000-000000000003', 'Format Daily', [320, 400], 'Daily spending recap:');
const dailyTelegram = telegramNode('d1e2f3a4-0004-4000-8000-000000000004', 'Send Daily', [512, 400]);

const isSunday = ifNode('d1e2f3a4-0005-4000-8000-000000000005', 'Is Sunday?', [128, 560], '$now.weekday', '7');
const weeklyQuery = queryNode('d1e2f3a4-0006-4000-8000-000000000006', 'Query Week', [320, 560], "$now.minus({ days: 6 }).startOf('day').toISO()");
const weeklyCode = codeNode('d1e2f3a4-0007-4000-8000-000000000007', 'Format Weekly', [512, 560], 'Weekly spending recap (last 7 days):');
const weeklyTelegram = telegramNode('d1e2f3a4-0008-4000-8000-000000000008', 'Send Weekly', [704, 560]);

const isLastDay = ifNode('d1e2f3a4-0009-4000-8000-000000000009', 'Is Last Day of Month?', [128, 720], '$now.day', '$now.daysInMonth');
const monthlyQuery = queryNode('d1e2f3a4-0010-4000-8000-000000000010', 'Query Month', [320, 720], "$now.startOf('month').toISO()");
const monthlyCode = codeNode('d1e2f3a4-0011-4000-8000-000000000011', 'Format Monthly', [512, 720], 'Monthly spending recap:');
const monthlyTelegram = telegramNode('d1e2f3a4-0012-4000-8000-000000000012', 'Send Monthly', [704, 720]);

d.nodes.push(
  scheduleTrigger, dailyQuery, dailyCode, dailyTelegram,
  isSunday, weeklyQuery, weeklyCode, weeklyTelegram,
  isLastDay, monthlyQuery, monthlyCode, monthlyTelegram
);

d.connections['Daily 10pm'] = { main: [[
  { node: 'Query Today', type: 'main', index: 0 },
  { node: 'Is Sunday?', type: 'main', index: 0 },
  { node: 'Is Last Day of Month?', type: 'main', index: 0 }
]] };
d.connections['Query Today'] = { main: [[{ node: 'Format Daily', type: 'main', index: 0 }]] };
d.connections['Format Daily'] = { main: [[{ node: 'Send Daily', type: 'main', index: 0 }]] };

d.connections['Is Sunday?'] = { main: [[{ node: 'Query Week', type: 'main', index: 0 }]] };
d.connections['Query Week'] = { main: [[{ node: 'Format Weekly', type: 'main', index: 0 }]] };
d.connections['Format Weekly'] = { main: [[{ node: 'Send Weekly', type: 'main', index: 0 }]] };

d.connections['Is Last Day of Month?'] = { main: [[{ node: 'Query Month', type: 'main', index: 0 }]] };
d.connections['Query Month'] = { main: [[{ node: 'Format Monthly', type: 'main', index: 0 }]] };
d.connections['Format Monthly'] = { main: [[{ node: 'Send Monthly', type: 'main', index: 0 }]] };

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow10.json', JSON.stringify(payload));
console.log('built, nodeCount:', payload.nodes.length);
