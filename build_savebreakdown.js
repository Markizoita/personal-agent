require('./env');
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('workflow_v14.json', 'utf8'));

const SB = 'https://hzwmypoifzazhekzbpos.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

function saveNode(id, name, pos, type) {
  return {
    parameters: {
      method: 'POST',
      url: SB + '/rest/v1/breakdowns',
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: SB_KEY },
          { name: 'Authorization', value: 'Bearer ' + SB_KEY },
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Prefer', value: 'return=minimal' }
        ]
      },
      sendBody: true,
      specifyBody: 'json',
      jsonBody: "={{ JSON.stringify({ type: '" + type + "', content: $json.text }) }}",
      options: {}
    },
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: pos,
    id,
    name
  };
}

const saveDaily = saveNode('b1c2d3e4-1001-4000-8000-000000000001', 'Save Daily Breakdown', [512, 480], 'daily');
const saveWeekly = saveNode('b1c2d3e4-1002-4000-8000-000000000002', 'Save Weekly Breakdown', [704, 640], 'weekly');
const saveMonthly = saveNode('b1c2d3e4-1003-4000-8000-000000000003', 'Save Monthly Breakdown', [704, 800], 'monthly');

d.nodes.push(saveDaily, saveWeekly, saveMonthly);

// Fan out each Format node to both Send (Telegram) and Save (Supabase)
d.connections['Format Daily'].main[0].push({ node: 'Save Daily Breakdown', type: 'main', index: 0 });
d.connections['Format Weekly'].main[0].push({ node: 'Save Weekly Breakdown', type: 'main', index: 0 });
d.connections['Format Monthly'].main[0].push({ node: 'Save Monthly Breakdown', type: 'main', index: 0 });

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow16.json', JSON.stringify(payload));
console.log('built, nodeCount:', payload.nodes.length);
