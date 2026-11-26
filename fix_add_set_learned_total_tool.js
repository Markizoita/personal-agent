require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_fixtotal1.json`);

const d = JSON.parse(fs.readFileSync('workflow_fixtotal1.json', 'utf8'));
const SB_URL = 'https://hzwmypoifzazhekzbpos.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

const tool = {
  id: 'ln0010-tool-settotal', name: 'set_learned_total', type: 'n8n-nodes-base.httpRequestTool', typeVersion: 4.5,
  position: [5700, 320],
  parameters: {
    toolDescription: "Sets or corrects a Learned item's total length (minutes for podcasts, pages for books). Call this when I say the total/runtime I gave was wrong, or give one for an item that doesn't have one yet.",
    method: 'POST', url: SB_URL + '/rest/v1/rpc/set_learned_total',
    sendHeaders: true,
    headerParameters: { parameters: [
      { name: 'apikey', value: SB_KEY }, { name: 'Authorization', value: 'Bearer ' + SB_KEY }, { name: 'Content-Type', value: 'application/json' }
    ] },
    sendBody: true, specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ p_item_id: $fromAI('item_id', 'the learned_items id, from find_learned_item', 'number'), p_total: $fromAI('total', 'the corrected total length in minutes (podcasts) or pages (books)', 'string') }) }}",
    options: {}
  }
};
d.nodes.push(tool);
d.connections['set_learned_total'] = { ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]] };

// prompt: teach the agent this tool exists, right after the "Adding time/pages to an EXISTING item" block
const agent = d.nodes.find(n => n.name === 'AI Agent');
let prompt = agent.parameters.options.systemMessage;
const marker = `Setting an EXACT spot, optionally with a takeaway`;
const addition = `If the total/runtime itself is wrong or was never set ("actually it's 90 minutes total", "the total didn't save"), call find_learned_item then set_learned_total with that item's id - never try to fix a wrong total via update_learned_progress, that only changes current position, not total. Reply with the corrected "<current> of <total>" line.

Setting an EXACT spot, optionally with a takeaway`;
if (!prompt.includes(marker)) { console.log('MARKER NOT FOUND'); process.exit(1); }
prompt = prompt.replace(marker, addition);
agent.parameters.options.systemMessage = prompt;
console.log('tool added, prompt updated:', prompt.includes('set_learned_total with that item'));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_fixtotal1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
