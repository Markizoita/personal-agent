# Before doing anything in this repo

1. Read `ROADMAP.md` - current status of every feature (done/paused/in progress),
   and who else (which session) is working on what.
2. Read `BUILD_LESSONS.md` - recurring bug patterns for this exact stack
   (n8n + Supabase + Telegram + Claude agent). Check new work against it
   before building, not just after something breaks.
3. If you change what's built, what's planned, or who's working on what -
   update `ROADMAP.md` and commit/push it, so the next session (on any
   device) picks up the change.
4. Real credentials live only in `.env` (gitignored), never hardcoded in a
   script. See `.env.example` for what's needed and `README.md` for setup.
