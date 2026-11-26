require('./env');
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('workflow_v11.json', 'utf8'));
let prompt = fs.readFileSync('system_message7.txt', 'utf8');

const SB = 'https://hzwmypoifzazhekzbpos.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

const getHistory = {
  parameters: {
    toolDescription: "Gets the itemized list of purchases (amount, merchant, category) between two dates. Use for ANY question about past spending beyond just today's total - 'what did I buy today', 'what did I spend on last week', 'show me November', etc. Figure out the actual start/end dates from what Mark said (today's date is given above) and pass them as ISO timestamps.",
    method: 'GET',
    url: "={{ '" + SB + "/rest/v1/spending?select=amount,merchant,category,created_at&order=created_at.asc&created_at=gte.' + encodeURIComponent($fromAI('start_date', 'start of the range, ISO timestamp, e.g. 2026-11-18T00:00:00-05:00', 'string')) + '&created_at=lt.' + encodeURIComponent($fromAI('end_date', 'end of the range, ISO timestamp', 'string')) }}",
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: 'apikey', value: SB_KEY },
        { name: 'Authorization', value: 'Bearer ' + SB_KEY }
      ]
    },
    options: {}
  },
  type: 'n8n-nodes-base.httpRequestTool',
  typeVersion: 4.5,
  position: [1008, 144],
  id: 'f1a2b3c4-0001-4000-8000-000000000001',
  name: 'get_spending_history'
};

const getTotalBetween = {
  parameters: {
    toolDescription: "Gets the EXACT total spent between two dates (server-computed, never guess/add this yourself). Use alongside get_spending_history whenever Mark asks how much he spent over any period other than just today.",
    method: 'POST',
    url: SB + '/rest/v1/rpc/get_total_between',
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: 'apikey', value: SB_KEY },
        { name: 'Authorization', value: 'Bearer ' + SB_KEY },
        { name: 'Content-Type', value: 'application/json' }
      ]
    },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: "={\n  \"start_date\": \"{{ $fromAI('start_date', 'start of the range, ISO timestamp', 'string') }}\",\n  \"end_date\": \"{{ $fromAI('end_date', 'end of the range, ISO timestamp', 'string') }}\"\n}",
    options: {}
  },
  type: 'n8n-nodes-base.httpRequestTool',
  typeVersion: 4.5,
  position: [1104, 144],
  id: 'f1a2b3c4-0002-4000-8000-000000000002',
  name: 'get_total_between'
};

d.nodes.push(getHistory, getTotalBetween);
d.connections['get_spending_history'] = { ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]] };
d.connections['get_total_between'] = { ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]] };

const addition = `

For any question about spending beyond just "today's total" (e.g. "what did I buy today", "how much did I spend last week", "show me this month so far", "what did I spend in November"), use get_total_between for the exact total and get_spending_history for the itemized list - figure out the actual date range from what Mark said and today's date above. Never add up or estimate spending yourself - always get the total from get_total_between, never compute it from the itemized list.`;

prompt = prompt + addition;
const agent = d.nodes.find(n => n.name === 'AI Agent');
agent.parameters.options.systemMessage = prompt;

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow13.json', JSON.stringify(payload));
console.log('built, nodeCount:', payload.nodes.length);
