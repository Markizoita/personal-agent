require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_sumweek1.json`);

const d = JSON.parse(fs.readFileSync('workflow_sumweek1.json', 'utf8'));
const SB_URL = 'https://hzwmypoifzazhekzbpos.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

function httpCall(id, name, rpc, jsonBody, pos) {
  return {
    id, name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos,
    retryOnFail: true, maxTries: 3, waitBetweenTries: 2000,
    parameters: {
      method: 'POST', url: SB_URL + '/rest/v1/rpc/' + rpc,
      sendHeaders: true,
      headerParameters: { parameters: [
        { name: 'apikey', value: SB_KEY }, { name: 'Authorization', value: 'Bearer ' + SB_KEY }, { name: 'Content-Type', value: 'application/json' }
      ] },
      sendBody: true, specifyBody: 'json', jsonBody, options: {}
    }
  };
}
function telegramSend(id, name, pos) {
  return {
    id, name, type: 'n8n-nodes-base.telegram', typeVersion: 1.2, position: pos,
    retryOnFail: true, maxTries: 3, waitBetweenTries: 2000,
    parameters: { chatId: CHAT_ID, text: '={{ $json.text }}', additionalFields: {} },
    credentials: { telegramApi: { id: '8H0hBfrPobhcvfBu', name: 'Telegram account' } }
  };
}

const FORMAT_CODE = (label) => `
const d = $json;
const g = d.game || {};
const lvl = g.level != null ? 'Level ' + g.level : '';
const title = g.title ? g.title + ' · ' : '';
const xp = Math.round(g.total_xp || 0);
const streak = g.streak != null ? g.streak : 0;
const metrics = (d.metrics || []).map(m => {
  const val = m.unit === 'dollars' ? '$' + m.value : (m.unit === 'hours' ? m.value + 'h' : m.value);
  const prev = m.prev != null ? ' (prev ' + (m.unit === 'dollars' ? '$' + m.prev : (m.unit === 'hours' ? m.prev + 'h' : m.prev)) + ')' : '';
  return m.label + ': ' + val + prev;
}).join(' · ');
const titlesThisWeek = (g.titles || []).filter(t => t.earned && t.earned_on && t.earned_on >= d.from).map(t => t.name);
const titleLine = titlesThisWeek.length ? ('\\nNew titles: ' + titlesThisWeek.join(', ')) : '';
const text = 'Start Up Ops · ${label}\\n' + title + lvl + ' · ' + xp + ' XP · Streak ' + streak + '\\n' + (metrics || '(nothing logged)') + titleLine;
return [{ json: { text } }];
`.trim();

const queryWeekStartup = httpCall('su_wk1', 'Query Week Start Up', 'get_dashboard_progress', '{"p_period":"week"}', [320, 880]);
const formatWeekStartup = { id: 'su_wk2', name: 'Format Weekly Start Up', type: 'n8n-nodes-base.code', typeVersion: 2, position: [512, 880], parameters: { jsCode: FORMAT_CODE('this week') } };
const sendWeekStartup = telegramSend('su_wk3', 'Send Weekly Start Up', [704, 880]);

const queryMonthStartup = httpCall('su_mo1', 'Query Month Start Up', 'get_dashboard_progress', '{"p_period":"month"}', [320, 1040]);
const formatMonthStartup = { id: 'su_mo2', name: 'Format Monthly Start Up', type: 'n8n-nodes-base.code', typeVersion: 2, position: [512, 1040], parameters: { jsCode: FORMAT_CODE('this month') } };
const sendMonthStartup = telegramSend('su_mo3', 'Send Monthly Start Up', [704, 1040]);

d.nodes.push(queryWeekStartup, formatWeekStartup, sendWeekStartup, queryMonthStartup, formatMonthStartup, sendMonthStartup);

// Fan out from the SAME existing Sunday / last-day-of-month checks, alongside the Finance ones.
d.connections['Is Sunday?'] = { main: [[...d.connections['Is Sunday?'].main[0], { node: 'Query Week Start Up', type: 'main', index: 0 }]] };
d.connections['Query Week Start Up'] = { main: [[{ node: 'Format Weekly Start Up', type: 'main', index: 0 }]] };
d.connections['Format Weekly Start Up'] = { main: [[{ node: 'Send Weekly Start Up', type: 'main', index: 0 }]] };

d.connections['Is Last Day of Month?'] = { main: [[...d.connections['Is Last Day of Month?'].main[0], { node: 'Query Month Start Up', type: 'main', index: 0 }]] };
d.connections['Query Month Start Up'] = { main: [[{ node: 'Format Monthly Start Up', type: 'main', index: 0 }]] };
d.connections['Format Monthly Start Up'] = { main: [[{ node: 'Send Monthly Start Up', type: 'main', index: 0 }]] };

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_sumweek1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
