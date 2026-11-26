require('./env');
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('workflow_v19.json', 'utf8'));

const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const catchupTrigger = {
  parameters: {
    rule: {
      interval: [
        { field: 'cronExpression', expression: '0 10 * * *' },
        { field: 'cronExpression', expression: '0 14 * * *' },
        { field: 'cronExpression', expression: '0 17 * * *' }
      ]
    }
  },
  type: 'n8n-nodes-base.scheduleTrigger',
  typeVersion: 1.2,
  position: [-96, 960],
  id: 'f9e8d7c6-0001-4000-8000-000000000001',
  name: 'Daytime Catch-up Reminders'
};

const sendReminder = {
  parameters: {
    chatId: CHAT_ID,
    text: 'Catch-up check: any purchases since last time? Tell me what and how much.',
    additionalFields: {}
  },
  type: 'n8n-nodes-base.telegram',
  typeVersion: 1.2,
  position: [128, 960],
  id: 'f9e8d7c6-0002-4000-8000-000000000002',
  name: 'Send Catch-up Reminder',
  retryOnFail: true,
  maxTries: 3,
  waitBetweenTries: 2000,
  credentials: { telegramApi: { id: '8H0hBfrPobhcvfBu', name: 'Telegram account' } }
};

d.nodes.push(catchupTrigger, sendReminder);
d.connections['Daytime Catch-up Reminders'] = { main: [[{ node: 'Send Catch-up Reminder', type: 'main', index: 0 }]] };

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow21.json', JSON.stringify(payload));
console.log('built, nodeCount:', payload.nodes.length);
