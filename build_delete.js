require('./env');
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('workflow_v10.json', 'utf8'));
let prompt = fs.readFileSync('system_message6.txt', 'utf8');

const SB = 'https://hzwmypoifzazhekzbpos.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

const getRecent = {
  parameters: {
    toolDescription: "Lists the 10 most recent purchases (id, amount, merchant, category, when logged). Call this whenever Mark wants to delete, correct, or refer back to a specific past purchase, so you can find its id.",
    method: 'GET',
    url: SB + '/rest/v1/spending?select=id,amount,merchant,category,created_at,confirmed&order=created_at.desc&limit=10',
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
  position: [816, 144],
  id: 'e1f2a3b4-0001-4000-8000-000000000001',
  name: 'get_recent_purchases'
};

const deletePurchase = {
  parameters: {
    toolDescription: "Permanently deletes one purchase by id. Only use this after get_recent_purchases, and only when you're confident which entry Mark means - if more than one recent entry could match what he said, list the candidates and ask which one instead of guessing.",
    method: 'DELETE',
    url: "={{ '" + SB + "/rest/v1/spending?id=eq.' + $fromAI('id', 'the id of the purchase to delete, from get_recent_purchases', 'number') }}",
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
  position: [912, 144],
  id: 'e1f2a3b4-0002-4000-8000-000000000002',
  name: 'delete_purchase'
};

d.nodes.push(getRecent, deletePurchase);
d.connections['get_recent_purchases'] = { ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]] };
d.connections['delete_purchase'] = { ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]] };

const addition = `

If Mark asks to delete, remove, undo, or correct a purchase, call get_recent_purchases first to see recent entries and their ids. If exactly one entry clearly matches what he described (by amount, merchant, or "the last one"), delete it with delete_purchase and confirm what was deleted, e.g. "Deleted: $14 at Chipotle." If more than one entry could plausibly match, list the candidates (amount + merchant + when) and ask which one before deleting anything - never guess on a delete.`;

prompt = prompt + addition;
const agent = d.nodes.find(n => n.name === 'AI Agent');
agent.parameters.options.systemMessage = prompt;

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow12.json', JSON.stringify(payload));
console.log('built, nodeCount:', payload.nodes.length);
