# Personal Agent Roadmap

## Status / to-do (2026-11-26, updated — Learned + TikTok done, Start Up Ops v1 in progress)

Done: Wake up, Health, Finance, Schedule, Notes, conversation memory,
Learned, TikTok (including the periodic usage nudge). Start Up Ops v1 is
the current build (see its own section below) — a from-scratch redesign,
replacing the old paused Start Up fields in `daily_log`.

**Git repo — done (2026-11-26).** Private repo at
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

**The Climb (the real game system) — live (2026-11-26), replaces the simple
hour-goal scoring entirely, per Mark's explicit call.** Task-based XP across
four powers (Work/Shipping/Selling/Earning), levels that never drop, titles
earned once and kept, streak/weather from daily results. Built across both
sessions: the dashboard/cloud session wrote the SQL (`game_sql.sql`,
`dashboard_sql.sql`) and wired the Telegram side directly against the live
n8n workflow (it has its own n8n API key) - `log_game_task`/`undo_game_task`
tools, "did <task>", auto-detected shipped/pitched, "/game", the whole-form
"Climb" display, Sunday weekly recap. This session's part was running the
actual SQL against Supabase, since that cloud container can only make HTTPS
calls, not a raw Postgres connection - tested live (logged + undid a task).
Old hour-goal rules (fixed daily minute target, level up/down by weekly win
count) are gone, replaced by these functions: `finalize_startup_day` (Win =
proof logged, no hour goal), `get_startup_today`, `stop_startup_session`,
`log_startup_proof` - all now game-aware.

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
7. **TikTok — not started.** Backend buildable without Mark; the iPhone
   Shortcuts setup (open/close events) needs him, same pattern as Apple
   Pay. Last piece, by Mark's request (he may need to help scope it).
8. **Start Up — paused (2026-11-26), not deleted.** Mark wants a better
   system for this eventually. The bot no longer asks about or shows
   Start Up (build/plan hours, proof) in the Breakdown or `/today` — its
   fields still exist in `daily_log` and nothing was removed, just the
   active asking/showing turned off until redesigned.
9. **Learned (books/podcasts), Start Up System's weekly/monthly review,
   Twitter agent — on hold,** not part of the current build. Revisit
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
