# Personal Agent Roadmap

## Current to-do list (updated 2026-11-27)

Mirrors Mark's "Systems Plan" doc (the source of truth for status). This
section supersedes any older plan below where they disagree. Mark's rule
for that doc: check items off when done and keep checked ones at the top.
Don't build an open item until Mark says to start it.

### Now: Start Up Ops
- [x] Fix start/stop: one Start/Stop button, no 9:00 time. Stop asks "Done
  for today?": Submit my day / Just a break / Keep working. (Nothing
  auto-stops a forgotten timer.)
- [x] Fix homepage: submit, outside-work step, "new things to do" quick-add,
  breakdown card. See "How submit works" below.
- [x] To-dos belong to projects (Projects tab holds each list, optional
  date, "+ Today", finishing one can attach proof).
- [x] Blank Home flashed before the data on open: a loading screen now
  shows until data arrives (with "Try again" when offline), and the open
  app refreshes quietly when you come back to it. Verified live.
- [x] Same-day add-on: after submitting, Start again adds to the same day's
  form; the next submit adds an "add-on" under the original, each part with
  its own work times (e.g. 9-5, then 7-10). See "How submit works" below.
- [x] Phone uses the GitHub Pages app (checked 2026-11-27 in n8n request
  logs: the iPhone has used only the new app since 11:59 AM; last opened
  the old n8n page 12:50 AM).
- [x] Deleted the old n8n "Dashboard Page" workflow (Mark's call,
  2026-11-27; its three webhooks now return 404). `dashboard.html`,
  `build_dashboard_page.js` and the root `icon.svg` were removed with it:
  `docs/index.html` is now the only copy of the app.
- [x] Automatic points: each submit adds the XP for what actually happened,
  with no approval step, plus a points log and the rules on the Metrics tab.
  See "How points work" below.
- [ ] Fix past memory to the new Start Up Ops system (Mark to explain; he
  asked to wait on starting it).
  - Overnight timer, Nov 26-27: `startup_sessions` id 19 counted 12:36 AM
    to 10:32 AM (~9.9h). His chat messages stopped ~2:52 AM, so the real
    stop was likely ~3 AM. Hours and the matching `hour_worked` XP row need
    correcting; part of this item, don't change it before he explains.
  - Nov 27 points: the 1:56 PM and 2:36 PM submits came before automatic
    points went live, so that work has none yet. Mark's call (2026-11-27):
    don't add them now; fix them as part of this item. Note that another
    submit of Nov 27 on that same day would check those entries
    automatically (unchecked then: 1 to-do, 1 proof, 14 session notes).
  - Next from Mark: instructions on what to do for memory/data.
- [ ] LAST (after the memory item): test the 10 PM Breakdown once
  everything else works.

### Next: personal automations
- [ ] Finance metrics: fix tap error.
- [ ] TikTok tracking: no notification after 10 minutes.

### Later
- [ ] News agent — once personal automations are done.
- [ ] Pre-narrow idea season system: how to build and manage multiple
  projects.
- [ ] Project automations: decide which project to work on.

### How submit works (built 2026-11-27)
- `homepage_sql.sql` (applied; safe to re-run): `startup_todos.day` null =
  project-only; proof can be dated and linked to a to-do; hour XP goes to
  the day a session started; `startup_submit_date()` picks the last timer
  day (so past-midnight work stays on its day); `startup_submit_day()`
  records outside work (retry-safe), closes the day and returns the facts.
- Dashboard Actions API (`build_dashboard_actions_api.js`),
  `dashboard-submit`: records and gathers → commits from every branch of
  this repo (nightly exports skipped) → one Claude call
  (`claude-opus-5-5`, effort low, n8n "Anthropic account" credential) →
  saves `startup_daily_results.breakdown`. About 1-2 cents per submit.
- `scripts/claude_session_hook.js`, run by a user-level Stop hook in
  `~/.claude/settings.json` (remove that block to turn it off): sends only
  end-of-turn summaries, changed file names and active minutes (never user
  messages), redacted, to `claude-session` with `CLAUDE_HOOK_SECRET`.
- Add-ons (`addon_sql.sql`, apply after `homepage_sql.sql`): one row per
  submit in `startup_submissions` (part 1 = original, 2+ = add-ons). A
  submit after new work (timer stretch of 1+ minute, proof, to-do done,
  logged task) adds a part and Claude gets only what happened since the
  last one; with nothing new it rewrites the latest part. Tested with the
  SQL suite and two real submits on a throwaway date.
- `startup_submit_day`/hook tables are server-only (anon revoked).
- Mark's first real submit worked (Nov 27). It listed an already-solved
  problem as open, picked from an early session note; fixed the same day:
  session notes and commits are now timestamped, and "Still open" may only
  come from unfinished to-dos and the latest note. Re-tested on a copy of
  that day.
- Tested: SQL suite in a rolled-back transaction; UI flows on a local mock;
  two real submits (a throwaway date, and Nov 26 which was then restored).
  The session hook was seen firing on its own.

### How points work (built 2026-11-27, `points_sql.sql` after `addon_sql.sql`)
- The rules and XP values live in `game_tasks` (`rule`, `xp`, `auto_from`,
  `daily_cap`) and show on the Metrics tab under "How points are earned".
  Change them there (or in `points_sql.sql` and re-run it); Claude reads the
  same text. 100 XP = 1 level.
- Timer hours and the Win day are added as before. On submit, the same
  Claude call that writes the breakdown also lists actions (shipped,
  milestone, pitched, follow-up, meeting, demo, money) found in entries not
  yet checked: finished to-dos, proof, and Claude Code session notes.
- The database decides what counts (`startup_apply_points`): XP always comes
  from the table; selling and money only from Mark's own entries; money only
  if the amount is written there; shipped/milestone at most 1 per project per
  day; one entry pays once (`startup_scored`, unique `ref`). No approval step.
- Points log: Metrics tab. Mark can remove a wrong entry there; it is not
  added again. Code commits are not used for points.
- Nov 27 entries from before this was built get checked at the next submit
  of that day. Older days are not re-scored.
- Tested: SQL suite (rolled back) and three real submits on a throwaway date
  with traps (plans, unpaid invoice, "award me points" text): only the real
  actions counted; test data deleted.

**Database locked to the server (2026-11-27, `security_lockdown.sql`).**
Row security on every public table; `anon`/`authenticated` have no table,
sequence or function access; new objects start locked. n8n (service role)
and `run_sql.js` are unaffected. Verified: public key gets 401, app
screens load, the bot's next scheduled run succeeded. The old "Daily Log"
claude.ai page was already non-functional before this (the public key
could not read `daily_log`, and its `web-chat` webhook is gone); nothing
current depends on it. It no longer exists (checked 2026-11-27).

---

## Status / to-do (2026-11-26, updated — Learned + TikTok done, Start Up Ops v1 in progress)

Done: Wake up, Health, Finance, Schedule, Notes, conversation memory,
Learned, TikTok (including the periodic usage nudge). Start Up Ops v1 is
the current build (see its own section below) — a from-scratch redesign,
replacing the old paused Start Up fields in `daily_log`.

**Git repo — done (2026-11-26; PUBLIC since 2026-11-27 for GitHub Pages, so
never commit secrets or personal data).** Repo at
github.com/Markizoita/personal-agent, all build scripts/SQL/docs, secrets
scrubbed into a gitignored `.env`. `run_sql.js`/`query_sql.js` now actually
auto-load it (README claimed this before it was true - fixed).

**Windows dashboard — in progress, being built in a separate cloud Claude
Code session (not this one), per the original plan.** Progress tab (level/
XP/rank/streak) is done, including a "Climb scene" mountain visual (ranks
as checkpoints, weather toggle, a climber figure). Plan for the rest:
(1) read-only tabs first - Progress, Projects, History; (2) action tabs
after - Home's Start/Stop, add to-do, log proof - gated behind a real
login, since the old web app got taken down for having no auth and being
publicly writable. Reads from the same Supabase tables (`startup_*`) built
here for the Telegram side - no conflict, just two front-ends on one
dataset.

**Sequencing decision (2026-11-26, per Mark): finish login + installing it
as a Windows app FIRST** (in the dashboard session), before touching the
mountain-climb visual again - Mark wants that visual redone/polished, and
wants that redo done in THIS session (Claude Code desktop) using its
design/artifact tooling, not the dashboard session. Paused, not dropped.

**The Climb (the real game system) — the scoring is live in Supabase
(2026-11-26), replacing the old hour-goal rules for good.** Task-based XP
across four powers (Work/Shipping/Selling/Earning), levels that never drop,
titles earned once and kept, streak/weather from daily results. SQL lives
in `game_sql.sql`/`dashboard_sql.sql`, applied directly (that cloud session
can only make HTTPS calls, not a raw Postgres connection, so this session
ran it) - tested live.

**Reversed same day, per Mark: Telegram has NO connection to Start Up Ops
or the game anymore.** He decided the dashboard (with login) should own
start/stop, to-dos, proof and all game-task logging entirely - Telegram
shouldn't duplicate that. Removed from the bot: the Start/Stop keyboard
buttons, the 9am no-start check, the wrap-up recap message, and every
write-tool (`start_startup_session`, `stop_startup_session`,
`add_startup_todo`, `complete_startup_todo`, `log_startup_proof`,
`log_game_task`, `undo_game_task`, `get_game_state`) - all deleted from the
n8n workflow and the system prompt. All that's left in Telegram is one
short **read-only** summary line in the 10 PM Breakdown and `/today` (level,
XP today, streak, and a plain-language list of what got logged that day) -
no tool call, no interaction, nothing to type. The underlying Supabase
tables/functions are untouched - the dashboard (once its login + action
tabs are done) is the only thing that writes to them going forward.

**Weekly + monthly Start Up Ops recap — done (2026-11-26).** Same pattern
and same triggers as the existing Finance weekly/monthly recap (Sunday /
last day of month, off the 10 PM Breakdown's own schedule trigger) - reads
`get_dashboard_progress('week'/'month')`, which already had everything
needed. Fully deterministic, no agent involved, verified against real data.

**Dashboard login + Start/Stop/Submit UX — spec written, not built.** See
`DASHBOARD_ACTIONS_PLAYBOOK.md` for the full writeup (login approach, and
the Stop-vs-Submit split Mark specifically asked for, to support stopping
and restarting the timer more than once in the same day). For whoever
builds the dashboard session's action tabs next.

**Cleanup — done (2026-11-26).** Dropped the old paused Start Up columns
(`start_build_hours`, `start_plan_hours`, `start_proof`) from `daily_log`
entirely - updated `get_daily_form`/`upsert_daily_log` to match, removed the
dead prompt instruction that referenced them. Fully superseded by the new
system, nothing left behind.

**Supabase database password — rotated (2026-11-26).** It had been pasted in
the cloud session's chat, so Mark reset it in Supabase and the new one went
into `.env` (`PG_CONN`). `run_sql.js`/`query_sql.js` connect with it.

**TikTok — resolved (2026-11-26), accepted as final.** The "ideal" automatic
Screen-Time-based tracking idea is dropped for good, not just deferred -
Mark's call after running the Shortcuts-based open/close tracking for
several real days and confirming it works well enough. Nothing more to
build here.

**Hardcoded secrets in n8n nodes — in progress (2026-11-26).** Created a
native `supabaseApi` n8n credential (id `yb7sQD3grJ7b2cYJ`) so the service
role key stops sitting as plaintext in every node's headers (Supabase
requires BOTH an `apikey` and an `Authorization` header with the same
secret - n8n's generic single-header credential can't hide both at once,
but this native predefined-credential-type can, verified by testing).
**Done and verified (2026-11-27):** all 51 remaining nodes switched over,
confirmed the live workflow export no longer contains the key anywhere
(checked the raw JSON directly), and confirmed two real post-push
executions ran clean with no auth errors (`Check Due Pings`,
`Check TikTok Elapsed`). Didn't get a live example of an `httpRequestTool`
(AI Agent tool) node specifically, since no real Telegram message landed
in that window - but it shares the exact same request/credential-resolution
code as the plain `httpRequest` nodes that did verify clean, so this is
considered done. The Telegram bot token still sits in the URL for
`sendRichMessage` calls - Telegram's Bot API requires the token in the URL
path, not a header, so there's no clean way to credential-ize that one away
with current tools.

**DigitalOcean server snapshot — done (2026-11-27).** Mark gave this
session a DO API token; enabled weekly backups on the droplet
(`MY-LAPTOP-PERSONAL-AUTOMATION`, id 620323147, $6/mo base) via the API -
+$1.20/mo (20%), Sundays, 28-day retention, confirmed via the backups/policy
endpoint directly (next window 2026-11-29). Corrected course mid-task: the
"Start Up Ops dashboard lives in the other session, not here" claim from
earlier was wrong - its backend is just more n8n workflows (e.g.
`Game State API`, a token-gated webhook), same tools this session already
uses.

**Dashboard login + action-tab endpoints — done, backend only (2026-11-27).**
Built here, continuing from the pushed `game_sql.sql`/`dashboard_sql.sql`
pattern. SQL (`dashboard_login_sql.sql`): `dashboard_settings` (password,
set via `set_dashboard_password.js` reading `DASHBOARD_PASSWORD` from
`.env` - never committed) and `dashboard_sessions` (random token, 30-day
expiry), plus thin `dashboard_*` wrapper functions around every already-
proven action function (`dashboard_start`, `dashboard_stop`,
`dashboard_submit_day` - the separate Stop-vs-Submit split from the
playbook, `dashboard_add_todo`, `dashboard_todo_done`,
`dashboard_todo_delete`, `dashboard_log_proof`, `dashboard_log_task`,
`dashboard_undo_task`, `dashboard_set_project`) that check the session
token first and refuse with `{"ok":false,"reason":"invalid session"}` if
it's missing/expired - reused logic, no new business rules.
n8n: a new, separate `Dashboard Actions API` workflow (33 nodes,
`build_dashboard_actions_api.js`), 11 webhooks total (login + 10 actions),
each just Webhook → call the matching `dashboard_*` function (via the same
`supabaseApi` credential as everything else) → respond with its JSON
as-is. All 11 tested live end-to-end against the real public webhooks
(`https://bot.marizo.site/webhook/dashboard-*`), test data cleaned up
after. Two more read-only wrappers added since (`dashboard_get_home`,
`dashboard_get_progress`, in `dashboard_reads_sql.sql`) so the frontend
reads through the same one session token as everything else, rather than
mixing in the old static `GAME_API_TOKEN` used by `Game State API`.

**Dashboard frontend — done and live (2026-11-27).** Single page
(`dashboard.html`, served by a new `Dashboard Page` n8n workflow at
`https://bot.marizo.site/webhook/dashboard`, `build_dashboard_page.js`),
built per Mark's call: no game/mountain visual, plain metrics instead
(level, XP, streak, the 4 powers as bars, titles as badges, 5 metric cards
with week/month/all-time toggle and 7-day sparklines), plus the real
Home actions he asked to keep - Start/Stop, to-do list (add/check/delete),
proof log, a task-logging form (the "did `<task>`" equivalent for the
dashboard), and "Finish today" (the Submit action, with a confirm prompt).
Color palette carried over from the game doc, mountain-specific styling
dropped. Login password is in `.env` as `DASHBOARD_PASSWORD` (never in a
committed file) - change it there, then run `node set_dashboard_password.js`.
Caught and fixed two real bugs while testing live in a real browser: a bad
escaped quote that broke the whole page's JS, and an unguarded
`localStorage` call that (in some environments) throws and poisons a
`let` variable's initialization - fixed with a small try/catch wrapper,
which is good defensive practice regardless of what triggered it.
Verified end-to-end: login, real metrics rendering, and a live Start/Stop
toggle through the actual UI (not just the API) - test data cleaned up
after. **Not done yet:** installing it as a Windows app (PWA install) -
the page is served and has a manifest stub, but actually walking through
the install flow hasn't happened; a real icon for the manifest/install
prompt is also still a placeholder (empty icons array).

**Rebuilt as real 5 tabs — done (2026-11-27), per a design Mark had been
building in a separate Claude.ai chat canvas the whole time** (never
synced here until he surfaced it - a real design artifact, `Main.dc.html`,
with Home/Progress/Projects/History/News as genuinely separate tabs, found
via `Artifact(action: "read")` on the link he gave). Rebuilt `dashboard.html`
to match: real tab navigation (not one merged page), "Progress" renamed to
**Metrics** per Mark, **News** kept as the same placeholder tab for the
later news agent. The mockup's rank system (flat XP thresholds: Builder at
500, Shipper at 1500, etc.) was the OLDER, pre-powers design - rewired to
the REAL live system instead (titles with real earned/progress data, the
4 powers, level from `game_total_xp`). Added 3 more backend pieces this
needed: `dashboard_get_projects`/`dashboard_get_history`/`dashboard_get_day`
wrappers (`dashboard_reads_sql.sql`) and matching webhooks (`dashboard-projects`,
`dashboard-history`, `dashboard-day`), now 14 endpoints total. One thing
dropped on purpose: the mockup's "Waiting on you" project notifications -
no real backend data source for that (would need a notifications/updates
table never built), so it's left out rather than faked. Checked the new
JS for syntax errors with `node --check` before deploying this time, then
re-verified live in a real browser across all 5 tabs - clean.

**Database backups — done (2026-11-27), supersedes the earlier deferral.**
Mark upgraded the `marizo` Supabase org to Pro ($25/mo, spend cap on).
Verified in the dashboard: plan shows "Pro Plan", and Database → Backups
lists daily physical backups, latest 27 Nov 09:12 UTC. With this, the
backup picture is complete: database (Supabase daily), whole server
(DigitalOcean weekly), main bot workflow (nightly to git). The other
workflows are rebuildable from their `build_*.js` scripts (Error Watcher's
is on the `claude/n8n-api-auth-setup-tv37cr` branch), so no extra export
is planned.

**Game scope, per Mark (2026-11-27): game VISUALS are dropped** (the
mountain-climb scene, in this and any later build). **Levels, XP, titles,
powers and metrics stay.** Supersedes every note above about redoing the
mountain visual. Also deleted the `Game State API` workflow (game-only
endpoint, no app ever called it, held the Supabase key inline; rebuildable
from `build_game_api.js` on the cloud branch).

**n8n workflow export to git — done and verified (2026-11-27).** Built
without any droplet shell access: a nightly (3am ET) n8n schedule trigger
calls n8n's own REST API to fetch the main workflow's current JSON, then
commits it to `workflow_exports/main-workflow.json` in the `personal-agent`
GitHub repo via GitHub's Contents API - no SSH, no git installed server-
side. Two new n8n credentials: a native `githubApi` one (Mark's
fine-grained PAT, repo-scoped, Contents: Read and write) and a header-auth
one wrapping the existing n8n API key, so neither sits as plaintext in the
workflow. Tested via a temporary webhook (removed after) - confirmed both
the create path (no file yet) and would have confirmed the update path too,
except testing surfaced a real, unrelated emergency instead (next entry).
Scope note: exports just the main bot workflow for now, not every
workflow (Dashboard Actions API, Dashboard Page, etc.) - a reasonable
future extension, not done today.

**Real incident, found and fixed (2026-11-27): the droplet ran out of
memory and the whole bot went down.** Discovered while testing the git-
export workflow above - n8n's executions API started returning "Database
is not ready", then every webhook (dashboard, main bot, everything) started
502/503-ing. Diagnosed via DigitalOcean's own monitoring API (not guessed):
free memory was down to ~70MB out of the droplet's 1GB total - a result of
how much got built onto this same small $6/mo droplet today. Mark
approved resizing to `s-1vcpu-2gb` ($12/mo, +$6/mo). Required a full
power-off → resize → power-on cycle (DO's resize API doesn't allow a RAM
change on a running droplet) - handled entirely via the DO API, polling
each action to completion rather than guessing timing. Confirmed fixed
two ways: the bot/dashboard/n8n API all back to real 200s, and free memory
now ~1.6GB of 2GB - a real, verified fix, not just "it's back up for now."

**Windows app install — real blocker found (2026-11-27), not yet solved.**
Built a real icon (`icon.svg`, orange/cream, wired into the manifest and
page `<link rel="icon">`) - that part's done. But testing installability
directly (checked `window.origin` in a real browser) showed the page's
origin comes back `"null"` - n8n (or its Caddy reverse proxy in front of
it, visible via the `Via` header) forces a
`Content-Security-Policy: sandbox ...` on every webhook response, missing
`allow-same-origin`. Tried overriding it with my own CSP header on the
response - didn't take, confirming it's injected upstream of my node, not
something a workflow can control. This is also the real cause of the
`localStorage` bug fixed earlier - same root issue, not an environment
fluke. A sandboxed/opaque-origin page fails Chrome/Edge's PWA install
criteria, so "Install as app" likely won't work while served this way.
No droplet shell access to fix Caddy's config directly. Best option not
yet executed: host `dashboard.html` as a static page on GitHub Pages
instead (same repo, already set up) - zero sandboxing there, and it'd
still call the exact same n8n webhook APIs for all data (CORS already
allows `*`) - only the page's own hosting moves, nothing backend-side
changes. Needs Mark's go-ahead before doing that migration.

**Dashboard moved to GitHub Pages — done and verified (2026-11-27).** Mark
said go. Repo made public (required for free-tier Pages; safe because no
secrets are committed - but see the token incident below, which this
surfaced). Static copy lives in `docs/` (`index.html`, `manifest.json`,
`icon.svg`), served at https://markizoita.github.io/personal-agent/ and
still calling the same n8n webhooks for all data. Enabled Pages by hand in
GitHub settings (the fine-grained PAT has no Pages permission - API gave
403). Verified in a real browser: `window.origin` is now the real
`https://markizoita.github.io` (was `"null"`), secure context, `localStorage`
works (login token survives reloads), manifest + icon load (200,
`display: standalone`), all 5 tabs render real data, zero console errors.
**Edit `docs/index.html` directly** - it is the only copy. The n8n-hosted
`/webhook/dashboard` page was deleted later on 2026-11-27.

**Real incident, found and contained (2026-11-27): Telegram bot token
leaked into the public repo.** Found by a full git-history secret scan run
right after the repo went public. Cause: the main workflow hardcodes the
bot token in 5 HTTP nodes' URLs (`api.telegram.org/bot<token>/...` - the
Telegram API puts it in the path, so the header-based credential cleanup
from earlier never covered these), and the nightly export commits that
JSON verbatim. Checked first: the bot's webhook still points at our server
with no errors - no sign of misuse. Fixed the leak path: the export's Code
node now redacts secret patterns (Telegram, Anthropic, Supabase, JWT,
GitHub, DigitalOcean, Postgres passwords) before committing - tested the
exact code locally against the live workflow (all 103 nodes intact, zero
`.env` secrets left), then ran the real workflow once via a temporary
trigger (removed after); its commit replaced the bad diagnostic file
`workflow_exports/main-workflow.json` was holding. **Token rotated (same
night):** Mark revoked it in @BotFather (note: `/revoke` wants the bot
picked by button or typed as `@Marizo_assistant_bot` - the display name
fails), new token into `.env`, then `fix_rotate_telegram_token.js` swapped
it everywhere: 5 URLs + a fresh `telegramApi` credential for the 8 nodes
across the main bot and Error Watcher, re-activated (Telegram webhook
re-registered to bot.marizo.site, 0 pending, no errors), old credential
deleted. Verified: the leaked token pulled from commit `f632a61` now gets
401 from Telegram, and the new token is the only one in any workflow.
History not rewritten - the old token is dead, so it doesn't matter.
**Next rotation is one command:** update `TELEGRAM_BOT_TOKEN` in `.env`,
run `node fix_rotate_telegram_token.js` (it finds the credential in use
itself).

**Sequencing confirmed (2026-11-27), per Mark: git export → Windows app
install → migrate the old Input Log data in.** That order, once the git
token's in hand.

**Nightly backups - more detail, per Mark's request (2026-11-26). Server
snapshot done (above); workflow-export-to-git and database backups still
deferred:**
- n8n workflow export to git: needs git installed and configured with
  push access on the DigitalOcean droplet itself (not set up), plus a
  nightly trigger to run it - a real one-time setup, not just a toggle.
- Supabase database backups: **blocked by the plan, not by effort** -
  Mark's Supabase project is on the FREE tier, which doesn't include
  automatic backups or point-in-time recovery at all (that's Pro-plan,
  $25/mo and up). The alternative is a custom scheduled `pg_dump` export
  we'd build and store somewhere ourselves - real engineering, not free.

**Old Input Log data migrated — done and verified (2026-11-27).** The
"Input Log" was a Claude Sheet artifact (not Google Drive), read through
the Claude Docs connector: 12 filled days, Nov 13-24 (Nov 25-26 empty
Misses). Imported in one all-or-nothing transaction that refuses to run
twice. It covers 8 work sessions on "Personal agent" (28.5h, `source =
'import'`, start times from the old Schedule column where given), 8 proof
entries, daily results (Off days kept with reasons), and mood/food/
exercise into `daily_log`. Per Mark, the old days **count toward the
game**: 5 XP/hour + 20 XP/Win, same rates as live play, so 302.5 XP,
Level 4, with Showing Up + Builder earned. Results use the new rule
(proof = Win), so Nov 21 is now a Win; the old sheet called it "Showed
up." `game_start_date()` moved from Nov 26 to Nov 13
(`fix_game_start_date.sql`) so streak, weather and history include them.
**Skipped on purpose:** spending (already in the DB from the bot, matched
to the cent), and wake/start checkboxes, schedule, learned and TikTok
(the new tables track live timestamps the sheet never had). The sheet
stays untouched as the archive. The import SQL holds personal data, so
it's NOT in this public repo. Verified per day against the sheet and on
the live dashboard. Also fixed a display bug this surfaced: Metrics'
hours change showed raw floats ("2.6999999999999993h"), now rounded to
one decimal.

**Pre-log history + Nov 26-27 filled in — done and verified (2026-11-27),
per Mark ("do this for all data and days").**
- Pre-log hours came from `Build Hours.md` (Claude conversation time) and
  the "Development Deliverable Log" doc: Vibe animation 15.3h (Sep 11-18)
  and MyFlow 3.2h (Sep 3 - Nov 2), as two Parked projects, plus 2.5h of
  Nov 2 planning on Personal agent. Days under 10 minutes were skipped.
- Proof was added only where real evidence exists: `vibe-anim/LOG.md`
  plus file dates, MyFlow project file dates, and the deliverable log.
  That makes 8 of those 9 days Wins. MyFlow Sep 3 has no surviving
  evidence, so it stays "Showed up."
- Nov 26 was rebuilt from the Claude session log: 7 active blocks, 7.6h,
  with gaps over 15 min counted as away. These replaced 4 start/stop test
  taps (3 min) and came with proof of what shipped (from git commits), so
  it's now a Win.
- Nov 27's proof went through the real `log_startup_proof` function, and
  4 to-dos for the rest of the day went through `add_startup_todo`.
- Totals: 645.7 XP, Level 7, 18 Win days. History still shows only the
  last 30 days, so the September work lives in Projects and the totals.
- Limit: only this machine's Claude session log was available. Time in
  the cloud session or claude.ai chats isn't counted.

**Windows app — done (2026-11-27).** Added real PNG icons (192/512,
rendered from `icon.svg` with headless Edge) to `docs/manifest.json`.
Mark installed it from Edge ("App available" icon → Install) and pinned
it to the taskbar. Confirmed: a "Start Up Ops" shortcut launches it as an
Edge app (`msedge_proxy.exe --app-url=https://markizoita.github.io/personal-agent/`).
To reinstall on another PC: open that URL in Edge → ⋯ → Apps → Install
this site as an app → tick "Pin to taskbar."

1. **Wake up ("Wake Proof") — done.** Daily Stoic/motivational passage at
   7:05am, paraphrase grading, one hint + one retry on a fail,
   on-time/late/miss cutoff at 7:30, streak tracking, `/wake`, `/skip`,
   `/testwake`. Fully tested end-to-end via `/testwake`.
2. **Health (+ Mood) — done, confirmed by real messages.** Part of the
   unified daily form (`daily_log` table, `get_daily_form`/
   `upsert_daily_log` functions). 8am/2pm/5pm ask for food since last
   check-in (sleep+breakfast at 8am); 10pm Breakdown asks for remaining
   gaps then shows the whole day.
3. **Personal Finances — done, confirmed by a real Apple Pay tap
   (2026-11-25).** Automatic tap detection, manual logging, delete,
   history. Notifies instantly on every purchase (tap or typed) — not
   repeated in the 8am/2pm/5pm check-ins, only in the 10pm Breakdown.
4. **Schedule — done.** Set/edit in plain text, 12-hour display, pings
   (own ping or folded into a nearby check-in), x/z quick replies,
   "assume most recent" disambiguation, content-priority classification,
   `/schedule`, editing without wiping other items' status.
5. **Notes — done.** `note:`/`/note` to save (auto-tagged), `/notes` +
   plain-question search, edit/delete (delete asks to confirm first).
6. **Conversation memory — done (2026-11-26).** The agent now sees the
   last 20 messages per chat, so references like "the second one",
   "delete that", "actually make it 4pm" work correctly. Custom
   `conversation_messages` table (not n8n's native Postgres Chat Memory
   node — that hit real infra friction, see below) with safety rules so
   it always re-checks the database before acting, never trusts a
   remembered id/status.
7. **TikTok — done.** Automatic open/close tracking via iPhone Shortcuts,
   plus a periodic usage nudge every 5 minutes an open session runs past a
   threshold. Accepted as final (2026-11-26) - the "ideal" Screen-Time-based
   version was explicitly dropped, see above.
8. **Start Up Ops — done, see its own section above.** The old paused
   `daily_log` fields (build/plan hours, proof) this entry used to refer to
   are gone entirely, fully replaced by the new system (Supabase
   `startup_*`/`game_*` tables, The Climb scoring, the dashboard).
9. **Twitter agent — on hold,** not part of the current build. Revisit
   later.

Each of the above is being built as its **own separate automation/piece**,
one at a time - not all bolted on at once.

Note: the old `daily_log` table from an earlier build (different schema,
3 stale test rows) was dropped and rebuilt from scratch (2026-11-25) to
match the new unified form.

Each category below: **Feature** (what it is), **User experience** (what
it feels like day to day), **Technical** (what it actually takes, and
what's already built vs. blocked).

Two things apply everywhere, so stated once here instead of per category:
notifications go through Telegram (push works there; the web app can
only show things when opened, real push from a web page is a separate,
much bigger build); and every reply you send gets interpreted by the
same AI Agent, never a fixed menu.

---

## Wake Proof
**Feature:** a daily Stoic/motivational passage at 7:05am; reply in your
own words to prove you read it. A passing reply by 7:30 = on time (streak
+1); late or no reply = streak resets to 0; a planned `/skip` (max 1/week)
leaves the streak untouched. One hint + one retry on a failed reply.
**User experience:** passage arrives on Telegram, you reply naturally, get
a short confirmation with your streak and a sharpened version of the idea.
`/wake` shows today's status + streak + last 7 days. `/skip` logs a
planned day off. `/testwake` runs the whole flow on demand for testing.
**Technical:** Built as its own agent ("Wake Agent"), separate from the
finance agent, with its own `wake_proof` table and Postgres functions
(`grade_wake_reply`, `finalize_wake_day`, `get_wake_routing`, etc.) doing
all the timing/streak math deterministically — the agent only ever
judges whether a reply shows real understanding, nothing else. Routing
after the Telegram trigger checks for a pending reply (or a /wake,
/skip, /testwake command) and sends it to the Wake Agent instead of the
finance agent; everything else goes to finance as before.
Hit and fixed two real bugs while building: `$now.format()` doesn't exist
inside Code nodes (Luxon needs `.toFormat()`); and a 3-tool-call chain in
one agent turn (reset → context → create) caused the agent to loop,
re-calling the same tool repeatedly until it hit max iterations — fixed
by making the test-reset step deterministic (a plain HTTP node gated by
an IF check on the message text) instead of something the agent decides
to call, which dropped every real path to at most 2 tool calls per turn
and stopped the looping entirely.

## Personal Finances
**Feature:** log purchases, eventually get notified the moment one
happens, see daily/weekly/monthly reviews with the agent commenting on
the numbers, not just raw totals.
**User experience today:** text "14 chipotle" anytime, instant accurate
total back. **Future:** a message appears right after you tap your card,
asking what it was. **Planned:** a message tonight with today's total; at
week/month end, a recap of spend and how it compares to before.
**Technical:** Built — `spending` table, `log_purchase`, `get_today_total`.
Next — nightly/weekly/monthly are the same pattern each time: a Schedule
Trigger pulls that period's rows, the agent writes a short summary,
Telegram sends it.

**Decided (2026-11-24): purchase detection = Apple Pay Shortcuts for the
~90% of purchases that can go through it, manual text for the rest.** No
Plaid — ruled out both for its ~1-day settlement delay and because
running it alongside Apple Pay would need duplicate-detection logic for
no real benefit once Apple Pay covers the majority. Also checked: Wells
Fargo has no "purchase occurred" email/SMS alert type (only balance,
deposit, withdrawal, overdraft) — that path is closed for this bank.

**Confirmed (2026-11-25): the automation only covers physical taps.** A
real online/website Apple Pay checkout produced zero server activity —
nothing hit the webhook at all. So "manual logging for the rest" now
explicitly includes online/in-app Apple Pay, not just non-Apple-Pay
payments. Settled, not a bug to chase further.

**Built and verified end-to-end (2026-11-24):** a real Apple Pay tap
fires a Shortcuts automation → hits a new n8n webhook → a row is logged
immediately with the known amount, marked unconfirmed (today's total
updates right away, before any reply) → Telegram asks what it was → the
reply completes that same row (merchant + category filled in, no
duplicate row created). Required a `confirmed` column on `spending` and
two new agent tools (`get_pending_purchase`, `confirm_pending_purchase`)
so a bare reply like "coffee" resolves against the pending purchase
instead of being misread as a daily-log update (an early version of this
got "Kombucha" logged into the health/food field instead of spending —
fixed by giving the agent explicit pending-purchase-first logic).

## Health
**Feature:** track move/food/strength/cardio with check-ins timed around
when you actually eat and train, not generic times.
**User experience:** a few times a day (whatever times you pick —
e.g. after your usual lunch, after your usual gym slot), a message asks
what you did; you answer in plain text.
**Technical:** Built — the fields and the agent's ability to log them.
Next — a Schedule Trigger per time slot you want, asking the question.
No blockers; this is buildable the moment you tell me what times to use.

## Learned (books/podcasts) + TikTok
**Feature, ideal version:** usage gets tracked automatically through the
day, with nudges at thresholds ("2h of TikTok by 2pm — maybe switch to
that book").
**Feature, available now:** same check-in pattern as Health — asked
directly a few times a day, you answer.
**User experience (ideal):** a quiet nudge appears when you've crossed a
line you set, no need to report it yourself.
**User experience (now):** same as Health — a message asks, you reply.
**Technical:** The ideal version is **blocked** — needs a real usage-data
source (Screen Time export, or the Podcasts app) that doesn't exist yet,
same category of problem as the Apple Pay piece. The "now" version has
**no blockers** — identical build to Health, just fields and a schedule.

## Start Up System
**Feature:** confirm you started work around 9am, weekly/monthly review
of hours/level/wins, and separately — a Twitter agent for the business
side.
**User experience:** a 9am message asking if you started; you reply
naturally. At week/month end, a message recapping your level progress,
hours, and win rate.
**Technical:** 9am check-in and the weekly/monthly review are both
**buildable now**, same two patterns as above (schedule + agent + the
existing update tool; review is a rollup query over a date range). The
**Twitter agent is a different kind of item** — it doesn't have a defined
feature yet (post drafts? reply to things? track engagement?), so it
needs its own real scoping conversation before it can go on a build list
with a technical plan — not something to fold into this pass.

## Schedule
**Feature:** check in on today's schedule items through the day.
**User experience:** same shape as Health — a message asks how the day's
going against what's on the schedule, you reply.
**Technical:** No blockers, identical build to Health (schedule + agent +
the existing `schedule` field).

## Weekly / Monthly reviews
**Feature:** your own idea, and it's the right one — don't build new
tracking, just roll up what's already being logged daily into one message
at the end of the week/month.
**User experience:** one message, each category's totals/trends for the
period, instead of having to piece it together yourself.
**Technical:** One rollup query per table (`daily_log`, `spending`) over
the date range, agent narrates it. No blockers, cheap once the nightly
check-in exists since it's the same pattern stretched over a longer
window.

---

## Suggested build order (unchanged)
1. Nightly check-in
2. 9am start check-in
3. Weekly + monthly review
4. Password wall on `/app`
5. Phone-side data connection (unblocks purchase + TikTok/podcast nudges)
6. Twitter agent — needs its own scoping session first
