// The to-do list lives in Start Up Ops. Claude Code sessions keep it current with this (needs ../.env).
//   node scripts/todo.js list
//   node scripts/todo.js add "<project>" "<what, in general terms>" [now|next|later|today]
//   node scripts/todo.js done <id> ["proof"]
//   node scripts/todo.js move <id> today|tomorrow|none     (none = on the project list, no day)
const path = require('path');
process.chdir(path.join(__dirname, '..'));
require('../env');
const { Client } = require('pg');

const [cmd, a, b, c] = process.argv.slice(2);
const usage = 'Usage: node scripts/todo.js list | add "<project>" "<text>" [now|next|later|today] | done <id> ["proof"] | move <id> today|tomorrow|none';

(async () => {
  if (!['list', 'add', 'done', 'move'].includes(cmd) || (cmd === 'move' && !['today', 'tomorrow', 'none'].includes(b))) { console.log(usage); process.exitCode = 1; return; }
  const db = new Client({ connectionString: process.env.PG_CONN, ssl: { rejectUnauthorized: false } });
  await db.connect();
  const one = async (sql, args) => (await db.query(sql, args)).rows[0].r;
  try {
    if (cmd === 'list') {
      const projects = await one('select get_dashboard_projects() r');
      for (const p of projects) {
        if (!p.todos.length) continue;
        console.log(p.name);
        for (const t of p.todos) console.log(`  #${t.id}  [${t.day || t.tag}]  ${t.text}`);
      }
    } else if (cmd === 'add') {
      const names = (await db.query('select name from startup_projects order by id')).rows.map(r => r.name);
      if (!names.includes(a) || !b) { console.log(`${usage}\nProjects: ${names.join(', ')}`); process.exitCode = 1; return; }
      const open = await one('select id r from startup_todos where project = $1 and lower(text) = lower($2) and not done union all select null limit 1', [a, b]);
      if (open) { console.log(`Already on the list: #${open}`); return; }
      const today = c === 'today';
      const res = await one('select add_startup_todo($1, $2, $3, $4) r', [a, b, today ? 'today' : 'none', today ? 'new' : (c || 'next')]);
      console.log(res.ok ? `Added #${res.id}` : res.reason);
    } else if (cmd === 'move') {
      const res = await one('select schedule_startup_todo($1, $2) r', [a || '', b]);
      console.log(res.ok ? `Moved #${res.id} to ${b}` : res.reason);
    } else {
      // finishing counts it on today's record, so it shows in today's breakdown
      const res = await one('select complete_startup_todo_with_proof($1, $2, $3) r', [a || '', 'true', b || null]);
      console.log(res.ok ? `Done: #${res.id} ${res.text}` : res.reason);
    }
  } finally { await db.end(); }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
