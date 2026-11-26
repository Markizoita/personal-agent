require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_dellearn1.json`);

const d = JSON.parse(fs.readFileSync('workflow_dellearn1.json', 'utf8'));
const SB_URL = 'https://hzwmypoifzazhekzbpos.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

const deleteLearnedItem = {
  parameters: {
    toolDescription: "Permanently deletes a learned item (wrong title, test entry, etc). Call find_learned_item first to get its id, and only delete after Mark has confirmed - ask 'Delete <title>? Reply yes to confirm' first, then use conversation history to see his confirmation before actually calling this.",
    method: 'POST',
    url: SB_URL + '/rest/v1/rpc/delete_learned_item',
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'apikey', value: SB_KEY },
      { name: 'Authorization', value: 'Bearer ' + SB_KEY },
      { name: 'Content-Type', value: 'application/json' }
    ] },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ p_item_id: $fromAI('item_id', 'the learned item id to delete, already confirmed', 'number') }) }}",
    options: {}
  },
  type: 'n8n-nodes-base.httpRequestTool',
  typeVersion: 4.5,
  position: [4368, 144],
  id: 'ln000002-0001-4000-8000-000000000001',
  name: 'delete_learned_item'
};

d.nodes.push(deleteLearnedItem);
d.connections['delete_learned_item'] = { ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]] };

const agent = d.nodes.find(n => n.name === 'AI Agent');
let prompt = agent.parameters.options.systemMessage;

const marker = `Finishing ("finished diary"): find_learned_item, then finish_learned_item with that id. Reply "✅ Finished: <title>".`;
const addition = `${marker}

Deleting ("delete diary", "remove that mfm episode"): call find_learned_item first. If exactly one match, ask "Delete <title>? Reply yes to confirm" and wait - do not call delete_learned_item yet. On a later confirming reply ("yes"/"y"/"confirm"), use conversation history to see which item that was and call delete_learned_item with its id, then reply "Deleted <title>." On a declining reply ("no"/"nevermind"), just say you left it alone. If more than one match, list them and ask which one first.`;

if (!prompt.includes(marker)) { console.log('MARKER NOT FOUND'); process.exit(1); }
prompt = prompt.replace(marker, addition);
agent.parameters.options.systemMessage = prompt;
console.log('delete instructions added:', prompt.includes('Deleting ("delete diary"'));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_dellearn1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
