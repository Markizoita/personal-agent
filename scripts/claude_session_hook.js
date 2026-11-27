// Claude Code "Stop" hook: after each reply, send today's session summary to Start Up Ops.
// Sends only Claude's own end-of-turn summaries, changed file names and active minutes. Never the user's messages.
// Must never block or break a session: every failure is silent and the exit code is always 0.
const fs = require('fs');
const os = require('os');
const path = require('path');

const ENDPOINT = 'https://bot.marizo.site/webhook/claude-session';
const AWAY_GAP_MS = 15 * 60 * 1000;
const PROJECT_NAMES = { 'personal-agent': 'Personal agent', 'vibe-anim': 'Vibe animation', 'myflow-app': 'MyFlow', myflow: 'MyFlow' };

function readEnv() {
  const env = {};
  try {
    for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].trim();
    }
  } catch (e) { /* no .env, nothing to send with */ }
  return env;
}

const etDay = t => new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

function redact(text, env) {
  let out = String(text);
  for (const [k, v] of Object.entries(env)) {
    if (/TOKEN|KEY|PASSWORD|SECRET|PG_CONN|CHAT_ID/.test(k) && v.length >= 6) out = out.split(v).join('<redacted>');
  }
  return out
    .replace(/\d{8,10}:AA[A-Za-z0-9_-]{30,}/g, '<redacted>')
    .replace(/(sk-ant-|sb_secret_|sb_publishable_|github_pat_|ghp_|dop_v1_)[A-Za-z0-9_-]{8,}/g, '<redacted>')
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, '<redacted>')
    .replace(/postgres(?:ql)?:\/\/\S+/g, '<redacted>')
    .replace(/(password|passcode|secret|token)(\s*(?:is|:|=)\s*)\S+/gi, '$1$2<redacted>')
    .replace(/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}\b/g, '<redacted>');
}

function projectFor(files, cwd) {
  const home = os.homedir().replace(/\\/g, '/').toLowerCase() + '/';
  const counts = {};
  for (const f of files) {
    const p = f.replace(/\\/g, '/');
    if (!p.toLowerCase().startsWith(home)) continue;
    const parts = p.slice(home.length).split('/');
    const folder = parts[0] === 'Desktop' || parts[0] === 'Documents' ? parts[1] : parts[0];
    if (!folder || parts.length < 2 || /^(AppData|\.claude|Downloads)$/i.test(folder)) continue;
    counts[folder] = (counts[folder] || 0) + 1;
  }
  let best = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  if (!best && cwd && !/scratch/i.test(cwd) && path.resolve(cwd) !== path.resolve(os.homedir())) best = path.basename(cwd);
  return best ? (PROJECT_NAMES[best] || best) : 'Claude session';
}

function summarize(transcript, today) {
  const times = [], recaps = [], replies = [], files = [];
  for (const line of transcript.split('\n')) {
    if (!line || !line.includes('"timestamp"')) continue;
    let o; try { o = JSON.parse(line); } catch (e) { continue; }
    if (!o.timestamp || (o.type !== 'user' && o.type !== 'assistant') || etDay(o.timestamp) !== today) continue;
    times.push(Date.parse(o.timestamp));
    if (o.type !== 'assistant' || o.isSidechain || !o.message || !Array.isArray(o.message.content)) continue;
    for (const b of o.message.content) {
      if (b.type === 'tool_use') {
        if (/wrap_up$/.test(b.name) && b.input && b.input.recap) recaps.push(b.input.recap);
        if (/^(Edit|Write|NotebookEdit)$/.test(b.name) && b.input && b.input.file_path) files.push(b.input.file_path);
      } else if (b.type === 'text' && o.message.stop_reason === 'end_turn' && b.text.trim()) {
        replies.push(b.text.trim().replace(/\s+/g, ' ').slice(0, 220));
      }
    }
  }
  times.sort((a, b) => a - b);
  let active = 0;
  for (let i = 1; i < times.length; i++) if (times[i] - times[i - 1] <= AWAY_GAP_MS) active += times[i] - times[i - 1];
  return { minutes: Math.round(active / 60000), notes: recaps.length ? recaps.slice(-14) : replies.slice(-8), files };
}

async function main(input) {
  const hook = JSON.parse(input);
  if (!hook.session_id || !hook.transcript_path) return;
  const env = readEnv();
  const secret = env.CLAUDE_HOOK_SECRET;
  if (!secret) return;
  const today = etDay(Date.now());
  const { minutes, notes, files } = summarize(fs.readFileSync(hook.transcript_path, 'utf8'), today);
  if (!notes.length && !files.length) return;
  const names = [...new Set(files.filter(f => !/[\\/](AppData|\.claude)[\\/]/i.test(f)).map(f => path.basename(f)))].slice(-12);
  const summary = redact(notes.map(n => '- ' + n).join('\n') + (names.length ? '\nFiles changed: ' + names.join(', ') : ''), env).slice(-4000);
  const payload = { session_id: hook.session_id, day: today, project: projectFor(files, hook.cwd), minutes, summary };
  if (process.argv.includes('--dry-run')) { console.log(JSON.stringify(payload, null, 2)); return; }
  await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ secret }, payload)), signal: AbortSignal.timeout(8000) });
}

let input = '';
process.stdin.on('data', c => { input += c; });
process.stdin.on('end', () => main(input).catch(() => {}).finally(() => { process.exitCode = 0; }));
