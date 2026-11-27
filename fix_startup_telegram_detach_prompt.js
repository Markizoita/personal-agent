require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_detachprompt1.json`);

const d = JSON.parse(fs.readFileSync('workflow_detachprompt1.json', 'utf8'));
const agent = d.nodes.find(n => n.name === 'AI Agent');
let prompt = agent.parameters.options.systemMessage;

// 1. Whole-form order item 6 - drop the Sunday week_summary/powers addition, just the simple line.
const orderMarker = `6. #### Start Up Ops (same shape as the Start Up Ops display rule above - never flagged as missing, just shown. ON SUNDAYS ONLY, add one more line at the end of this section from startup.game: "- This week: <week_summary.xp> XP · Powers up: <each power whose level > level_at_week_start, as 'Selling L1→L2', or 'none'> · Titles earned: <week_summary.titles_earned, or 'none'>")`;
const orderReplacement = `6. #### Start Up Ops (same shape as the Start Up Ops display rule below - never flagged as missing, just shown)`;
if (!prompt.includes(orderMarker)) { console.log('ORDER MARKER NOT FOUND'); process.exit(1); }
prompt = prompt.replace(orderMarker, orderReplacement);

// 2. Replace the whole "## Start Up Ops" + "## The Climb" block with one short read-only section.
const marker = `## Start Up Ops
A work timer + to-do list, separate from the old paused Start Up fields. The Start/Stop buttons on Mark's keyboard handle the timer directly - you never see those button presses. If Mark instead types "start <project>" or "stop" in plain text, call start_startup_session / stop_startup_session yourself.

To-dos: "todo: <project>: text" -> add_startup_todo (day 'today', tag 'new'). "tomorrow: <project>: text" -> add_startup_todo (day 'tomorrow', tag 'planned'). "done <text or number>" -> complete_startup_todo.

Proof: if Mark replies to a "Goal hit. Proof?" message, or describes something he shipped/finished for Start Up work, call log_startup_proof - do not ask for confirmation first. The first proof of the day makes it a Win day (+20 XP, automatic - its result has a \`game\` field; show it with The Climb lines below). If the proof clearly says he shipped/released something (or a GitHub release), also call log_game_task with task "shipped"; if it says he pitched someone, also call log_game_task with "pitched" - at most these 2 calls.

Display: everything you need is already in get_daily_form's \`startup\` field (game, minutes_today, open_session, todos_today, todos_tomorrow, result, proof_today) - never call a separate tool for this. Format minutes as h:mm, round XP to whole numbers. The first line is always the game line from startup.game: "<title> · Level <level> · <total_xp> XP · Today <today_xp> (avg <avg_day>) · Streak <streak>" - leave "<title> · " off if title is null, and "(avg ...)" off if avg_day is null. Example, for startup = {game:{title:"Seller", level:4, total_xp:340, today_xp:20, avg_day:35, streak:3, win_waiting:20}, minutes_today:55, open_session:{open:true,start_at:"...08:42:00Z"}, todos_today:[{text:"Fix TikTok webhook",done:false},{text:"Review notes",done:true}], result:null, proof_today:[]}:
#### Start Up Ops
- Seller · Level 4 · 340 XP · Today 20 (avg 35) · Streak 3
- Working now · 55m today (or "Not started today" if open_session.open is false and minutes_today is 0)
- To-dos: ☐ Fix TikTok webhook, ☑ Review notes
- Proof: none yet · +20 XP waiting (or list proof_today's entries; only add "· +<win_waiting> XP waiting" when game.win_waiting is set)
If result is already set (Win/Showed up/Miss/Off) for today, show it instead of "Working now"/"Not started today": "- Result: ✅ Win". A Win is simply a day with proof - there is no hour goal.

## The Climb (Start Up game)
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
(Use "No title yet" if title is null; "(no average yet)" if avg_day is null.)`;

const replacement = `## Start Up Ops
Read-only from here - no buttons, no commands, nothing for you to log. Start/Stop, to-dos and proof all happen on the separate dashboard web app now, not Telegram. Your only job is a short automatic summary, using what's already in get_daily_form's \`startup\` field (game, today_tasks) - never call a separate tool for this, never ask about it, never treat any message as input for it.

Display (10 PM Breakdown, \`/today\`, and the whole-form order below): one short block, round XP to whole numbers, drop the title if null. Example, for startup.game = {title:"Seller", level:4, total_xp:340, today_xp:20, streak:3, today_tasks:[{task:"Pitched someone"},{task:"Shipped something"}]}:
#### Start Up Ops
- Seller · Level 4 · 340 XP today · Streak 3
- Today: pitched someone, shipped something
If today_tasks is empty, use "Nothing logged yet today" as the second line instead of listing anything.`;

if (!prompt.includes(marker)) { console.log('BIG MARKER NOT FOUND'); process.exit(1); }
prompt = prompt.replace(marker, replacement);

// 3. /today instruction - drop the "lead with the game line" special case, it's just section 6 now like any other.
const todayMarker = `"/today" or "show me the whole form" (or "show me every metric" etc.) -> call get_daily_form for today, start with the game line from startup.game as the very first line (e.g. "Seller · Level 4 · 340 XP · Today 20 (avg 35) · Streak 3", same rules as in Start Up Ops), then show every section in the SAME ORDER as the 10 PM Breakdown recap above (Wake Proof first, always) - minus the tomorrow question, including Finance and Start Up Ops, skipping the old paused Start Up fields - using ⬜ for anything not filled in.`;
const todayReplacement = `"/today" or "show me the whole form" (or "show me every metric" etc.) -> call get_daily_form for today, show every section in the SAME ORDER as the 10 PM Breakdown recap above (Wake Proof first, always) - minus the tomorrow question, including Finance and Start Up Ops, skipping the old paused Start Up fields - using ⬜ for anything not filled in.`;
if (!prompt.includes(todayMarker)) { console.log('TODAY MARKER NOT FOUND'); process.exit(1); }
prompt = prompt.replace(todayMarker, todayReplacement);

agent.parameters.options.systemMessage = prompt;
console.log('order updated:', !prompt.includes('ON SUNDAYS ONLY'));
console.log('big block replaced:', prompt.includes('Read-only from here - no buttons') && !prompt.includes('## The Climb'));
console.log('today updated:', !prompt.includes('start with the game line'));
console.log('no leftover refs:', !prompt.includes('log_game_task') && !prompt.includes('undo_game_task') && !prompt.includes('start_startup_session') && !prompt.includes('add_startup_todo'));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_detachprompt1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
