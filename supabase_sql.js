// Runs SQL against Supabase over HTTPS via the Management API - works from
// cloud sessions, which can't open a direct Postgres connection (use run_sql.js
// locally). Needs SUPABASE_ACCESS_TOKEN (a personal access token) in .env.
//   node supabase_sql.js tweaks_sql.sql
//   node supabase_sql.js -q "select * from tweaks where status = 'open'"
require('./env');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT = 'hzwmypoifzazhekzbpos';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) throw new Error('SUPABASE_ACCESS_TOKEN must be set in .env');
const query = process.argv[2] === '-q' ? process.argv[3] : fs.readFileSync(process.argv[2], 'utf8');
if (!query) throw new Error('usage: node supabase_sql.js <file.sql> | -q "<sql>"');

// curl (not fetch) so requests go through the session's HTTPS proxy.
const tmp = path.join(os.tmpdir(), `sbq_${process.pid}.json`);
fs.writeFileSync(tmp, JSON.stringify({ query }), { mode: 0o600 });
const out = execSync(`curl -s -w "\\n%{http_code}" -X POST "https://api.supabase.com/v1/projects/${PROJECT}/database/query" -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" --data-binary @${tmp}`).toString();
fs.unlinkSync(tmp);
const status = out.slice(out.lastIndexOf('\n') + 1);
const text = out.slice(0, out.lastIndexOf('\n'));
if (!status.startsWith('2')) { console.error(`ERROR HTTP ${status}: ${text}`); process.exit(1); }
try { console.log(JSON.stringify(JSON.parse(text), null, 2)); } catch { console.log(text); }
