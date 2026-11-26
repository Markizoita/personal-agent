# Personal Agent

Build scripts and SQL for Mark's personal agent: Telegram bot -> self-hosted
n8n (DigitalOcean) -> Claude, backed by Supabase/Postgres.

n8n workflows are never hand-edited in the UI - every change here is a
Node.js script that fetches the live workflow JSON via n8n's REST API,
mutates it, and PUTs it back. SQL changes go straight to Supabase via
`run_sql.js`.

## Setup

1. `npm install`
2. `cp .env.example .env` and fill in the real values (ask Mark/Claude for
   these - they're never committed).
3. Run any `build_*.js` / `fix_*.js` script with `node <script>.js`. Scripts
   that need a direct Postgres connection (`run_sql.js`, `query_sql.js`) read
   `PG_CONN` from `.env` automatically via `env.js`.

## Files

- `ROADMAP.md` - current status of every feature (what's done, paused, next).
- `BUILD_LESSONS.md` - recurring bug patterns for this exact stack, checked
  before adding anything new.
- `run_sql.js <file>.sql` - runs a SQL file against Supabase directly.
- `query_sql.js "<SELECT ...>"` - runs a query and prints the rows.
- `supabase_sql.js <file>.sql` / `supabase_sql.js -q "<sql>"` - same, but over
  HTTPS via the Supabase Management API (needs `SUPABASE_ACCESS_TOKEN`). Use
  this from Claude Code cloud sessions, which can't open a direct Postgres
  connection.
- `build_*.js` / `fix_*.js` - one-off scripts that built or patched a specific
  n8n workflow feature. Each fetches the current workflow, mutates it in
  plain JS, writes `update_workflow_*.json`, and the caller PUTs it back via
  curl. These are kept as a historical record of how each piece was built,
  not meant to be re-run as-is.

## Secrets

Real credentials live only in `.env` (gitignored) - never hardcode a key
back into a script. `env.js` loads `.env` into `process.env` with no extra
dependency.
