// Sets (or changes) the dashboard login password. Reads DASHBOARD_PASSWORD
// from .env - the real value is never written to any committed file.
require('./env');
const { execSync } = require('child_process');
const SB_URL = 'https://hzwmypoifzazhekzbpos.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const PW = process.env.DASHBOARD_PASSWORD;
if (!PW) throw new Error('DASHBOARD_PASSWORD must be set in .env');

const fs = require('fs');
const os = require('os');
const path = require('path');
const tmp = path.join(os.tmpdir(), `dpw_${Date.now()}.json`);
fs.writeFileSync(tmp, JSON.stringify({ key: 'password', value: PW }), { mode: 0o600 });

execSync(`curl -s -X POST "${SB_URL}/rest/v1/dashboard_settings" -H "apikey: ${SB_KEY}" -H "Authorization: Bearer ${SB_KEY}" -H "Content-Type: application/json" -H "Prefer: resolution=merge-duplicates" --data-binary @${tmp}`);
fs.unlinkSync(tmp);
console.log('Dashboard password set.');
