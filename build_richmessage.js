require('./env');
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('workflow_v17.json', 'utf8'));

const SB_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Update the reply-format section of the system prompt to emit markdown
// (bold/italic) instead of plain text, since this now goes through
// Telegram's new sendRichMessage API instead of plain sendMessage.
let prompt = fs.readFileSync('system_message8.txt', 'utf8');
const oldFormat = `## Reply format
For every spending-related reply (a new purchase logged, a confirmed pending purchase, a deletion, a question about today's spending, or a status check), reply with ONLY this form, filled in with real numbers from the tools above - no extra commentary before or after it:

Daily Form

PERSONAL FINANCES
Total spent today: $<today's total, from get_today_total>
Total purchases today: <count of today's purchases>
- <merchant>: $<amount>
- <merchant>: $<amount>
(one line per purchase logged today, most recent last; if none yet, write "(nothing logged today)" instead of the list)

Only when it is actually relevant/available, add one extra line right after "Total purchases today":
- if today is Sunday: "This week's total: $<get_total_between for the last 7 days>"
- if today is the last day of the month: "This month's total: $<get_total_between for month-to-date>"
Leave these out entirely on a normal day - don't compute or show them unless they actually apply today.

If Mark asked about a different period (last week, November, etc.) instead of just today, still use this same form shape but swap the PERSONAL FINANCES numbers for that period's total/count/items instead of today's, and label it clearly (e.g. "Total spent (last 7 days): $X").`;

const newFormat = `## Reply format
Your reply is sent as a Telegram Rich Message using Markdown, so use real markdown syntax: **bold** for emphasis, *italic* for section headers, and "- " for bullet list items. For every spending-related reply (a new purchase logged, a confirmed pending purchase, a deletion, a question about today's spending, or a status check), reply with ONLY this form, filled in with real numbers from the tools above - no extra commentary before or after it:

**Daily Form**

*Personal Finances*

- Total spent today: **$<today's total, from get_today_total>**
- Total purchases today: **<count of today's purchases>**

**Today's purchases**
- <merchant>: **$<amount>**
- <merchant>: **$<amount>**
(one bullet per purchase logged today, most recent last; if none yet, write "(nothing logged today)" instead of the list)

Only when it is actually relevant/available, add one extra bullet right after "Total purchases today":
- if today is Sunday: "This week's total: **$<get_total_between for the last 7 days>**"
- if today is the last day of the month: "This month's total: **$<get_total_between for month-to-date>**"
Leave these out entirely on a normal day - don't compute or show them unless they actually apply today.

If Mark asked about a different period (last week, November, etc.) instead of just today, still use this same form shape but swap the Personal Finances numbers for that period's total/count/items instead of today's, and label it clearly (e.g. "Total spent (last 7 days): **$X**").`;

prompt = prompt.replace(oldFormat, newFormat);
const agent = d.nodes.find(n => n.name === 'AI Agent');
agent.parameters.options.systemMessage = prompt;

// Replace "Send a text message" (plain Telegram node) with an HTTP
// Request node calling the new sendRichMessage method, using the
// agent's markdown output directly.
const oldSend = d.nodes.findIndex(n => n.name === 'Send a text message');
const pos = d.nodes[oldSend].position;
d.nodes[oldSend] = {
  parameters: {
    method: 'POST',
    url: 'https://api.telegram.org/bot' + SB_TOKEN + '/sendRichMessage',
    sendHeaders: true,
    headerParameters: {
      parameters: [{ name: 'Content-Type', value: 'application/json' }]
    },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ chat_id: '" + CHAT_ID + "', rich_message: { markdown: $json.output } }) }}",
    options: {}
  },
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: pos,
  id: d.nodes[oldSend].id,
  name: 'Send a text message'
};

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow19.json', JSON.stringify(payload));
console.log('built, nodeCount:', payload.nodes.length);
console.log('prompt changed:', prompt.includes('Rich Message'));
