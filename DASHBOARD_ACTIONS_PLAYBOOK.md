# Dashboard action tabs: login + Start/Stop/Submit

Written 2026-11-26 in the Claude Code desktop session, for whoever builds the
dashboard's write-capable tabs (Home's Start/Stop, add to-do, log proof,
game-task logging). The read-only tabs (Progress, Projects, History) don't
need any of this.

## Why this exists

The old web app had no auth and was publicly writable - anyone with the link
could change Mark's data. That's the one thing this must not repeat.

## Login

Single user, so this doesn't need real accounts - just enough to stop a
stranger with the URL from writing anything.

- One shared password, stored as an env var (hashed, e.g. bcrypt) - never
  hardcoded, never in a committed file. `.env.example` in this repo already
  has the pattern for secrets.
- A simple login form: password in, on success set a signed session
  cookie/JWT with a reasonable expiry (a few weeks is fine - this is Mark's
  own device-installed app, not a public shared login).
- Every write endpoint (start/stop, add/complete/delete to-do, log proof,
  log/undo a game task, set project, set off day) checks that session before
  doing anything. Read-only endpoints can stay open if that's simpler, but
  writes must be gated.
- No need for password reset flows, multiple users, or OAuth - that's all
  more than this needs. Keep it to the minimum that blocks a stranger.

## Start/Stop/Submit - the actual behavior Mark wants

Two separate ideas that were conflated in the first Telegram build - don't
repeat that mistake here:

1. **Stop just pauses the clock for right now.** It logs the session's hours
   (already handled by `stop_startup_session`, which also logs XP via the
   hooks in `game_sql.sql`) and does NOT decide the day is over.
2. **A separate "Submit daily form" / "I'm done for today" action is what
   actually closes the day** (calls `finalize_startup_day`, which locks in
   the day's result and settles XP/level for that day). This should have a
   confirmation step ("Are you sure? This locks in today.") since it's not
   easily undone the same way a task log can be undone.

Why this split matters: Mark's real day isn't always one clean block. He
might stop at 5pm, leave a coffee shop, go home, and start again at 6pm for
a few more hours - same day, multiple start/stop cycles. The database
already handles this correctly with no changes needed:
- `start_startup_session` closes any stray open session and opens a new one.
- `startup_minutes_today()` / `startup_day_minutes()` sum ALL of a day's
  sessions, not just the most recent one.
- `finalize_startup_day` can be called more than once the same day (it's
  idempotent - recomputes and overwrites, doesn't double-count), so if he
  submits, then decides to work more, then submits again, the day's numbers
  just update correctly.

So the UI implication is simply: **Stop is a plain button, no confirmation.
Submit/Finish is a separate, clearly distinct button with a confirmation
step.** Don't merge them into one action.

## Day boundaries

No special "reset" logic needed - everything (`game_day_result`,
`get_game_state`, etc.) computes fresh off the actual calendar date already,
so a new day just starts fresh on its own. The only thing this build adds is
calling `finalize_startup_day` when Mark actually submits/finishes a day -
there's no scheduled check needed (no 9am check, no fixed end time) since
that was Telegram-specific machinery that's been removed.
