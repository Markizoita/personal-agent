require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_cmem1.json`);

const d = JSON.parse(fs.readFileSync('workflow_cmem1.json', 'utf8'));
const SB_URL = 'https://hzwmypoifzazhekzbpos.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

function sbHeaders(extra) {
  return { parameters: [
    { name: 'apikey', value: SB_KEY },
    { name: 'Authorization', value: 'Bearer ' + SB_KEY },
    ...(extra || [])
  ] };
}

// ---------- Remove the native Postgres Chat Memory node (hit IPv6/SSL infra friction) ----------
d.nodes = d.nodes.filter(n => n.name !== 'Postgres Chat Memory');
delete d.connections['Postgres Chat Memory'];

// ---------- Get recent conversation before building context ----------
const getRecentConv = {
  parameters: {
    method: 'POST',
    url: SB_URL + '/rest/v1/rpc/get_recent_conversation',
    sendHeaders: true,
    headerParameters: sbHeaders([{ name: 'Content-Type', value: 'application/json' }]),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ p_chat_id: $('Telegram Trigger').item.json.message.chat.id }) }}",
    options: {}
  },
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [160, -32],
  id: 'cm000001-0001-4000-8000-000000000001',
  name: 'Get Recent Conversation',
  retryOnFail: true,
  maxTries: 3,
  waitBetweenTries: 2000
};

d.nodes.push(getRecentConv);

// Route to Wake? false branch -> Get Recent Conversation -> Build Normal Reply Context (was -> Build Normal Reply Context directly)
d.connections['Route to Wake?'].main[1] = [{ node: 'Get Recent Conversation', type: 'main', index: 0 }];
d.connections['Get Recent Conversation'] = { main: [[{ node: 'Build Normal Reply Context', type: 'main', index: 0 }]] };

// ---------- Update Build Normal Reply Context to weave in history ----------
const buildCtx = d.nodes.find(n => n.name === 'Build Normal Reply Context');
buildCtx.parameters.jsCode = `const msgText = $('Telegram Trigger').item.json.message.text || '';
const history = $json.items || $json || [];
let historyBlock = '';
if (Array.isArray(history) && history.length > 0) {
  const lines = history.map(h => (h.role === 'user' ? 'Mark' : 'You') + ': ' + h.content);
  historyBlock = 'Recent conversation (oldest to newest, for context only - the newest message below is the actual instruction):\\n' + lines.join('\\n') + '\\n\\n';
}
const context = historyBlock + msgText;
return [{ json: { context, raw_user_text: msgText } }];`;

// ---------- Save the conversation turn after the agent replies ----------
const saveTurn = {
  parameters: {
    method: 'POST',
    url: SB_URL + '/rest/v1/rpc/save_conversation_turn',
    sendHeaders: true,
    headerParameters: sbHeaders([{ name: 'Content-Type', value: 'application/json' }]),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ p_chat_id: (() => { try { return $('Telegram Trigger').item.json.message.chat.id; } catch (e) { return null; } })(), p_user_text: (() => { try { return $('Build Normal Reply Context').item.json.raw_user_text; } catch (e) { return null; } })(), p_assistant_text: $json.output }) }}",
    options: {}
  },
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [336, -140],
  id: 'cm000001-0001-4000-8000-000000000002',
  name: 'Save Conversation Turn',
  retryOnFail: true,
  maxTries: 3,
  waitBetweenTries: 2000
};

d.nodes.push(saveTurn);

// AI Agent -> both Send a text message AND Save Conversation Turn (fan-out)
const existingTargets = d.connections['AI Agent'].main[0];
d.connections['AI Agent'] = { main: [[...existingTargets, { node: 'Save Conversation Turn', type: 'main', index: 0 }]] };

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_cmem1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
