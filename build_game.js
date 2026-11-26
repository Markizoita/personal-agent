// The Climb (Start Up game), bot side. Needs game_sql.sql applied first.
//  - AI Agent tools: log_game_task, undo_game_task, get_game_state
//  - Prompt: "did <task>", undo, /game, level/title announcements, game line in
//    Start Up Ops + /today header, Sunday Breakdown weekly game recap
//  - Stop / wrap-up recaps: new result rules (no hour goal), game line
// Safe to re-run.
require('./env');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const BASE = 'https://bot.marizo.site/api/v1';
const KEY = process.env.N8N_API_KEY;
const MAIN_ID = 'lULFqqQFMNb8byt2';

function api(method, url, body) {
  let data = '';
  if (body) {
    const tmp = path.join(os.tmpdir(), `n8n_body_${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify(body));
    data = `-H "Content-Type: application/json" --data-binary @${tmp}`;
  }
  const json = JSON.parse(execSync(`curl -s -X ${method} "${BASE}${url}" -H "X-N8N-API-KEY: ${KEY}" ${data}`).toString());
  if (json.message && !json.id && !json.data) throw new Error(`${method} ${url}: ${json.message}`);
  return json;
}
function replaceOnce(s, from, to, label) {
  if (s.includes(to)) return s;                       // already applied
  if (s.split(from).length !== 2) throw new Error(`anchor for ${label} not found exactly once - aborting`);
  return s.replace(from, to);
}

const wf = api('GET', `/workflows/${MAIN_ID}`);
fs.writeFileSync('workflow_before_game.json', JSON.stringify(wf, null, 2));
const byName = n => wf.nodes.find(x => x.name === n);

// ---------- tools ----------
const proofTool = byName('log_startup_proof');
const sb = proofTool.parameters.url.replace(/\/rest\/v1\/.*/, '');
const headers = proofTool.parameters.headerParameters;
const tool = (id, name, fn, description, body, y) => ({
  id, name, type: 'n8n-nodes-base.httpRequestTool', typeVersion: 4.5, position: [5900, y],
  parameters: {
    toolDescription: description, method: 'POST', url: `${sb}/rest/v1/rpc/${fn}`,
    sendHeaders: true, headerParameters: JSON.parse(JSON.stringify(headers)),
    sendBody: true, specifyBody: 'json', jsonBody: body, options: {}
  }
});
const TOOLS = [
  tool('game0001-tool-log', 'log_game_task', 'log_game_task',
    "Logs one Start Up game task and returns the XP earned, new total/level, and any level-up or new title. Use for 'did <task>' or when I say I pitched, followed up, booked a meeting, gave a demo, finished a milestone, shipped something, or earned startup money. Never for hours worked or Win day (those are automatic).",
    "={{ JSON.stringify({ p_task: $fromAI('task', 'one task key: milestone, shipped, follow_up, meeting, pitched, demo, money, hour_worked', 'string'), p_quantity: $fromAI('quantity', 'how many times, or dollars for money, or hours for hour_worked; empty string for 1', 'string'), p_note: $fromAI('note', 'short note on what/who, or empty string', 'string'), p_source: 'telegram' }) }}", 320),
  tool('game0002-tool-undo', 'undo_game_task', 'undo_game_task',
    "Undoes a logged Start Up game task by its id (the #number shown after logging). Use for 'undo <id>'.",
    "={{ JSON.stringify({ p_id: $fromAI('id', 'the task log id number', 'string') }) }}", 480),
  tool('game0003-tool-state', 'get_game_state', 'get_game_state',
    "Returns the full Start Up game state: title, level, XP, powers, titles with progress, today's XP vs average, streak, weather, this week. Use only for /game.",
    "={{ JSON.stringify({}) }}", 640)
];
const toolNames = TOOLS.map(t => t.name);
wf.nodes = wf.nodes.filter(n => !toolNames.includes(n.name)).concat(TOOLS);
for (const n of toolNames) wf.connections[n] = { ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]] };

// ---------- prompt ----------
const agent = byName('AI Agent');
let p = agent.parameters.options.systemMessage;

// Start Up Ops display: game line replaces the old level/goal line.
const dispStart = p.indexOf('Display: everything you need is already in get_daily_form');
const dispEndAnchor = 'If result is already set (Win/Showed up/Miss/Off)';
if (!p.includes('startup.game')) {
  const dispEnd = p.indexOf('\n', p.indexOf(dispEndAnchor));
  if (dispStart < 0 || dispEnd < 0) throw new Error('Start Up Ops display block not found - aborting');
  p = p.slice(0, dispStart) +
`Display: everything you need is already in get_daily_form's \`startup\` field (game, minutes_today, open_session, todos_today, todos_tomorrow, result, proof_today) - never call a separate tool for this. Format minutes as h:mm, round XP to whole numbers. The first line is always the game line from startup.game: "<title> · Level <level> · <total_xp> XP · Today <today_xp> (avg <avg_day>) · Streak <streak>" - leave "<title> · " off if title is null, and "(avg ...)" off if avg_day is null. Example, for startup = {game:{title:"Seller", level:4, total_xp:340, today_xp:20, avg_day:35, streak:3, win_waiting:20}, minutes_today:55, open_session:{open:true,start_at:"...08:42:00Z"}, todos_today:[{text:"Fix TikTok webhook",done:false},{text:"Review notes",done:true}], result:null, proof_today:[]}:
#### Start Up Ops
- Seller · Level 4 · 340 XP · Today 20 (avg 35) · Streak 3
- Working now · 55m today (or "Not started today" if open_session.open is false and minutes_today is 0)
- To-dos: ☐ Fix TikTok webhook, ☑ Review notes
- Proof: none yet · +20 XP waiting (or list proof_today's entries; only add "· +<win_waiting> XP waiting" when game.win_waiting is set)
If result is already set (Win/Showed up/Miss/Off) for today, show it instead of "Working now"/"Not started today": "- Result: ✅ Win". A Win is simply a day with proof - there is no hour goal.` + p.slice(dispEnd);
}

// Proof can also be a shipped/pitched game task.
p = replaceOnce(p,
  'Proof: if Mark replies to a "Goal hit. Proof?" message, or describes something he shipped/finished for Start Up work, call log_startup_proof - do not ask for confirmation first.',
  'Proof: if Mark replies to a "Goal hit. Proof?" message, or describes something he shipped/finished for Start Up work, call log_startup_proof - do not ask for confirmation first. The first proof of the day makes it a Win day (+20 XP, automatic - its result has a `game` field; show it with The Climb lines below). If the proof clearly says he shipped/released something (or a GitHub release), also call log_game_task with task "shipped"; if it says he pitched someone, also call log_game_task with "pitched" - at most these 2 calls.',
  'proof');

// The game section, before /today.
const GAME = `## The Climb (Start Up game)
XP, levels, powers and titles are all counted by the database - never compute, estimate or invent them; only use what the tools return. Round XP to whole numbers in replies.
- Automatic, never log these yourself: hours worked (added when the timer stops) and Win day (added by the first proof of the day).
- "did <task>", or plainly saying he did one ("pitched Sarah", "sent 3 follow-ups", "booked a call with Dan", "gave a demo", "finished the onboarding milestone", "earned $200 from the startup") -> call log_game_task ONCE with task = one key: milestone, shipped, follow_up, meeting, pitched, demo, money (startup income only, quantity = dollars), hour_worked (only if he explicitly asks to add hours by hand, quantity = hours); quantity = how many (empty for 1); note = short what/who. Don't ask for confirmation first - he can undo.
- After any game log (log_game_task, or a log_startup_proof result with \`game\`), ALWAYS add this so he can see and undo it:
#### The Climb
- +50 XP · Shipped something (Shipping) · #12 · "undo 12" to remove
- Seller · Level 4 · 340 XP · 60 to Level 5
Then one extra line for each of these, only when the result says so (it's said once, at the moment it happens): level_up true -> "- ⬆️ Level <level>!"; power_level_up true -> "- ⬆️ <power> power Level <power_level>"; each name in new_titles -> "- 🏅 New title: <name>". Example after a first pitch: "- +30 XP · Pitched someone (Selling) · #7 · "undo 7" to remove", "- Seller · Level 1 · 30 XP · 70 to Level 2", "- 🏅 New title: Seller". (Title on the second line = the highest title he holds; drop "<title> · " if none yet.)
- log_game_task returns ok:false with reason "unknown task" -> list the task names it returned and ask which one he meant.
- "undo <id>" -> undo_game_task with that id, reply "↩️ Removed #<id> · -<xp_removed> XP · Level <level> · <total_xp> XP".
- "/game" -> call get_game_state, reply:
#### The Climb
- <title> · Level <level> · <total_xp> XP · <xp_to_next> to Level <level+1>
- Today <today.xp> XP (avg <today.avg_day>) · Streak <streak> · <weather>
- Powers: Work L<n> · Selling L<n> · Shipping L<n> · Earning L<n>
- Titles: <earned names, comma separated, or "none yet"> · Next: <first unearned title> (<needs>, <progress>)
(Use "No title yet" if title is null; "(no average yet)" if avg_day is null.)

`;
p = replaceOnce(p, '## /today and /form commands\n', GAME + '## /today and /form commands\n', 'game section');

// /today header line.
p = replaceOnce(p,
  '"/today" or "show me the whole form" (or "show me every metric" etc.) -> call get_daily_form for today, show every section',
  '"/today" or "show me the whole form" (or "show me every metric" etc.) -> call get_daily_form for today, start with the game line from startup.game as the very first line (e.g. "Seller · Level 4 · 340 XP · Today 20 (avg 35) · Streak 3", same rules as in Start Up Ops), then show every section',
  '/today header');

// Sunday Breakdown weekly recap, inlined into the Breakdown bullet (lesson #10).
p = replaceOnce(p,
  '6. #### Start Up Ops (same shape as the Start Up Ops display rule above - never flagged as missing, just shown)',
  '6. #### Start Up Ops (same shape as the Start Up Ops display rule above - never flagged as missing, just shown. ON SUNDAYS ONLY, add one more line at the end of this section from startup.game: "- This week: <week_summary.xp> XP · Powers up: <each power whose level > level_at_week_start, as \'Selling L1→L2\', or \'none\'> · Titles earned: <week_summary.titles_earned, or \'none\'>")',
  'Sunday recap');

agent.parameters.options.systemMessage = p;

// ---------- recaps (no hour goal anymore) ----------
const gameLine = "const g = ($json.title ? $json.title + ' · ' : '') + 'Level ' + $json.level + ' · ' + Math.round($json.total_xp) + ' XP · Today ' + Math.round($json.xp) + (($json.avg_day != null) ? ' (avg ' + Math.round($json.avg_day) + ')' : '') + ' · Streak ' + $json.streak;";
const resultLine = "const resultLine = $json.result === 'Win' ? '✅ Win' : $json.result;";
byName('Format Stop Recap').parameters.jsCode =
`const wasRunning = $('Call stop_startup_session (button)').first().json.ok;
const m = $json.minutes; const h = Math.floor(m/60); const mm = m%60; const label = h>0 ? (h+'h '+mm+'m') : (mm+'m');
${resultLine}
${gameLine}
const head = wasRunning ? '⏹ Stopped.' : 'Nothing was running.';
const text = head + ' ' + label + ' logged today.\\nResult: ' + resultLine + '\\n' + g + (!$json.has_proof ? '\\nNo proof yet — send it for a Win day (+20 XP).' : '');
return [{ json: { text } }];`;
byName('Format Wrapup Recap').parameters.jsCode =
`const m = $json.minutes; const h = Math.floor(m/60); const mm = m%60; const label = h>0 ? (h+'h '+mm+'m') : (mm+'m');
${resultLine}
${gameLine}
const text = 'START UP · wrap-up\\n' + label + ' logged · Result: ' + resultLine + '\\n' + g + (!$json.has_proof ? '\\nNo proof logged yet — send it and it becomes a Win day (+20 XP).' : '');
return [{ json: { text } }];`;

const out = api('PUT', `/workflows/${MAIN_ID}`, { name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings });
const sp = out.nodes.find(n => n.name === 'AI Agent').parameters.options.systemMessage;
console.log('Saved. nodes:', out.nodes.length, '| active:', out.active, '| errorWorkflow:', out.settings.errorWorkflow);
console.log('tools wired:', toolNames.every(n => out.connections[n]?.ai_tool?.[0]?.[0]?.node === 'AI Agent'));
console.log('prompt:', ['startup.game', '## The Climb (Start Up game)', 'ON SUNDAYS ONLY', 'start with the game line', 'also call log_game_task with task "shipped"'].map(k => sp.includes(k)));
