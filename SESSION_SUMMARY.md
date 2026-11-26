# Session 1 Summary — First Personal Agent Built

## What we built (the loop)
Telegram (you message the bot) → n8n (Telegram Trigger node) → AI Agent node
(calls Claude via Anthropic API) → Telegram node (sends Claude's reply back
to you). First end-to-end working personal agent.

## Stack set up
- **Docker Desktop** — installed, runs n8n in an isolated container
- **n8n** — self-hosted via Docker, running at localhost:5678
- **Telegram bot** — created via @BotFather, token connected as credential
- **Anthropic API key** — connected as the AI Agent's Chat Model
- **Cloudflare quick tunnel** (`cloudflared`) — gives n8n a temporary public
  URL so Telegram can actually deliver messages to it

## Bugs hit and fixes
1. **Docker install failed** — needed the Windows "Virtual Machine Platform"
   feature. Fixed: ran `wsl --install` in an admin PowerShell, restarted,
   reinstalled Docker Desktop.
2. **Bot never responded, no error at all** — root cause: n8n was only
   reachable on `localhost`, invisible to the public internet, so Telegram
   had nowhere to deliver messages. Fixed: installed `cloudflared`, started
   a quick tunnel, restarted the n8n container with `WEBHOOK_URL` pointed
   at the tunnel's public URL.
3. **"Problem running workflow — 404 Not Found"** — n8n's own log showed a
   404 straight from Telegram's API, which means an invalid/empty bot
   token. Fixed: re-entered the token carefully in the Telegram credential
   and confirmed with n8n's "Connection tested successfully" check.
   (Note: the `__n8n_BLANK_VALUE_...` text shown in a saved credential
   field is normal masking, not itself a bug — the green success banner is
   what actually confirms it's working.)

## Quick concepts covered (just the labels, not deep dives)
- **Agent vs. automation** — automation runs fixed steps; an agent is a
  loop where an LLM decides what to do next.
- **Docker** — runs software in an isolated "room" so it can't conflict
  with other software or your actual OS; disposable and portable.
- **Server** — a program that stays running and answers requests (n8n is
  the server here).
- **Database** — organized storage a program uses to remember things
  (n8n's own data lives in the `n8n_data` volume).
- **Cloudflare tunnel** — gives something on a private network (your PC) a
  public address so outside services (Telegram) can reach it.
- **API** — how programs talk to each other, like ordering through a
  waiter; an API key is your ID card proving who's asking.

## Session 2 — moved to a real cloud server (2026-11-17)
Decided to stop patching the local PC + free-tunnel setup and move to a
real always-on cloud server instead — every future client build will run
on a server like this too, so it's not throwaway setup work.

**Server:** DigitalOcean droplet, Ubuntu 24.04, $6/mo (1 vCPU, 1GB RAM),
IP `64.227.83.203`, logged in via SSH key (no password auth).
**Domain:** `marizo.site`, registered through Cloudflare. DNS A record
`bot.marizo.site` → the droplet's IP (proxy off, "DNS only").
**Stack on the server:** Docker + Docker Compose running two containers —
**Caddy** (automatic free HTTPS via Let's Encrypt, reverse-proxies to
n8n) and **n8n** itself. Config lives in `/root/n8n-stack/` on the
server (`docker-compose.yml` + `Caddyfile`). Firewall (`ufw`) only allows
SSH, port 80, and port 443.
**Bot rebuilt** on this new n8n instance: same 3-node workflow (Telegram
Trigger → AI Agent → Send a text message), new owner account (separate
login from the local n8n), bot token re-entered, and a **new** Anthropic
API key created (the old local one couldn't be recovered/reused since
Anthropic only shows a key once at creation).

**Tested and confirmed working:** laptop fully shut down, messaged the
bot from phone on mobile data, it replied. Proof the whole thing now runs
independently of your computer, 24/7, on real infrastructure.

The old local n8n (Docker Desktop + Cloudflare quick tunnel on your
laptop) is no longer needed — the server replaces it. That local setup
can be left alone or cleaned up later, no rush either way.

## Noted for later (not urgent)
- **Personal account security** — many existing accounts/passwords spread
  across different emails over time, likely some reused/weak passwords
  out there. Worth setting up a password manager + better hygiene once
  further along (not blocking right now). Server was signed up for with
  the existing, more secure email.
- **Stretch goal from the original plan**: set up Supabase and a
  `spending` table, once the finance automation needs real data storage.

## Session 3 — finance logging MVP working (2026-11-19)
Built the first real automation on top of the server: the existing
Telegram bot's AI Agent now has two tools — **log_purchase** (writes to
Supabase) and **get_today_total** (reads back an exact sum via a Postgres
function, so totals are never AI-guessed math). Texting the bot something
like "14 chipotle" now logs it and replies with an accurate running total.

**Bugs hit along the way:**
- A UI glitch appended the word "send" to two header values when first
  configuring the tools, causing "Invalid API key" — fixed by pushing
  corrected values directly through n8n's API.
- The `get_today_total` Postgres function hadn't actually been created in
  Supabase despite appearing to run earlier — re-ran it and confirmed with
  a direct test before touching the bot again.
- A password-reset detour: locked out of the n8n owner login (no email
  configured for recovery) — fixed via `n8n user-management:reset` on the
  server, which preserved all existing workflows/credentials, only reset
  the login.

Test rows from debugging were deleted — the `spending` table is clean and
tracking real purchases from here.

## Session 4 — daily log system + web app (2026-11-19/20)

**Agreed direction:** Mark has a separate, more detailed system already
running in another Claude chat — a daily log/form (wake time, finances,
health, learned, TikTok, a leveling game for startup work, schedule) with
precise rules for how Win/Showed up/Miss/Off days count and how leveling
up/down works. Decision: port that exact system into this bot (same
Telegram bot, same AI Agent, new tools) rather than build something new,
since the rules were already proven through real daily use elsewhere.
Also agreed: build a lightweight web app on top of the same backend for
less friction than Telegram — explicitly scoped as a lower-friction *view
and input method* for the existing system, not new logic, and only
because it reuses the backend rather than requiring new build work.

**What got built:**
- **`daily_log` table** in Supabase — one row per day, matching the form's
  fields exactly.
- **Two more AI Agent tools**: `get_recent_logs` (last 14 days, for
  leveling/streak context) and `update_daily_log` (partial-field upsert —
  confirmed updates one field without wiping others already set that day).
- **Merged system prompt** covering both spending and the daily log: the
  exact form layout, the Win/Showed up/Miss/Off rules, leveling up/down
  rules, and reply behavior (form only, no commentary, abbreviate, "?" for
  uncertainty, etc.), plus new instructions to carry level/wins/total
  hours/next-step forward automatically when a new day starts.
- **A second entry point**: an n8n Webhook (header-auth protected) feeding
  the same AI Agent and tools, so something other than Telegram can talk
  to it too.
- **A real web app**, self-hosted at `https://bot.marizo.site/app` (Caddy
  serves it as a static file alongside n8n on the same server) — one box
  per form category in the same order as the original form, today's date
  shown clearly, a 14-day history list, and a chat box wired to the
  webhook for making updates without opening Telegram.
- **Server timezone fixed** — was defaulting to UTC; set to
  `America/New_York` so "today" lines up with Mark's actual day.

**Dead end worth remembering:** first built the web app as a Claude
Artifact. Discovered Artifacts can't `fetch()` arbitrary outside servers
(a hard platform sandbox limit, not a bug) — so it could never reach
Supabase or the webhook. Rebuilt it as a plain page hosted directly on
the DigitalOcean server instead, which has no such restriction and also
gives a real stable URL to add to a phone home screen.

**Known bugs hit and fixed this session:**
- Forgot the `=` prefix n8n needs to evaluate `{{ }}` expressions, so the
  system prompt's "today's date" was literal unevaluated text — the agent
  hallucinated a date ("5/29/25") instead. Fixed by adding `=`.
- Supabase SQL editor kept erroring because old text was still in the box
  from a previous run — the fix was always "clear the box completely
  first," not the SQL itself.

**Security gap flagged, not yet fixed:** the web app has no login, and
the webhook's auth secret is visible in the page's own source code to
anyone who finds the URL — meaning someone who discovered it could not
just read Mark's data but also write fake entries through the same
webhook. The URL isn't posted anywhere public, but that's not real
security (the domain itself is already logged publicly via Certificate
Transparency the moment it got an HTTPS cert). Proposed fix: add HTTP
Basic Auth on the `/app` route in Caddy — not yet done.

## Session 5 — full finance automation built (2026-11-24/25)

Started from Mark's original 3-feature scope: (1) purchase notification
from Apple Pay, (2) daily/weekly/monthly breakdown at 10pm, (3) a metric
dashboard. Decided to strip the daily-log system (health/learned/startup)
back out temporarily to focus purely on finance, one category fully done
before moving on — easily reversible later, nothing was lost.

**1. Apple Pay purchase notification — built, tested with a real purchase.**
- Checked Wells Fargo for instant transaction alerts first — not
  available (only balance/deposit/withdrawal/overdraft alerts exist).
  Confirmed Plaid stays ruled out (settlement delay). Decision: Apple Pay
  Shortcuts for the ~90% of purchases that go through it, manual text for
  the rest, no Plaid.
- Real architecture problem found and fixed: the first version only sent
  the "what was it?" question without logging anything, so the total
  didn't update until you replied, and a reply with no stated amount
  (e.g. "coffee") got misfiled into the health/food log instead of
  spending. Fixed by having the webhook log a row **immediately** with
  the known amount (marked unconfirmed), and adding two tools
  (`get_pending_purchase`, `confirm_pending_purchase`) so the reply
  completes that exact row instead of guessing.
- Set up the real Shortcuts automation on Mark's phone (Wallet/Transaction
  trigger → webhook) and confirmed a **real tap-to-pay purchase** fires
  the notification and logs correctly end to end.
- Added `get_recent_purchases` / `delete_purchase` so a wrong entry (from
  either source) can just be deleted by asking in plain language.

**2. Daily/weekly/monthly breakdown — built and verified, fires tonight.**
- One Schedule Trigger at 10pm daily; weekly and monthly messages are the
  same trigger with an added check (is it Sunday / is it the last day of
  the month), not separate schedules — matches Mark's "they just add up"
  framing exactly.
- Each message shows total spent, total purchase count, and the itemized
  list.
- Breakdowns are now also **saved** to a new `breakdowns` table (not just
  sent), specifically so the dashboard can display the latest one instead
  of having nothing to show between 10pm runs.

**3. Dashboard — built, rebuilt, and fixed several real bugs.**
- Self-hosted at `bot.marizo.site/app` (same server as before).
- Shows today's total, purchase count, itemized purchases, and the
  latest breakdown (or "scheduled for 10pm today" if none yet).
- Added a **chat box directly in the page**, reusing the exact same AI
  Agent as Telegram via a new webhook — same backend, same memory, two
  doors into one system. Anything typed there also shows up in Telegram
  since it's genuinely the same conversation.
- Real bug found and fixed: `anon` had table-level `GRANT` on `spending`
  but no actual RLS *policy*, so the dashboard silently showed nothing
  despite real data existing — classic "grant exists, policy doesn't"
  gap. Added the missing policy.
- Real mobile bugs found and fixed: iOS auto-zooms on any input under
  16px font (fixed by bumping it to 16px); a `position: fixed` chat dock
  fights with the on-screen keyboard in confusing ways — fixed by moving
  the chat box into normal page flow at the top instead of fighting the
  keyboard at all (simpler and more robust than chasing it).
- Renamed "Finances" → **"Daily Log"** with a "Personal Finances" section
  header, matching the same naming used for Telegram's reply format, for
  when other categories get added back later.

**Also done:**
- **Financial history/"memory" tools**: `get_spending_history` and
  `get_total_between` — the agent can now answer anything about past
  spending ("last week," "November," etc.) with an exact server-computed
  total, not guessed math. Clarified clearly: the agent itself has no
  memory at all, short or long term — every answer comes from a fresh
  database query at the moment it's asked; the database is what
  remembers, not the agent.
- **Consistent reply format**: every finance reply is now the same
  "Daily Form" layout (total, count, itemized list) instead of a
  different sentence each time.
- **Real historical data backfilled**: cleared out messy/duplicate test
  data from 11/19–11/20, then inserted 22 real purchases for
  11/16–11/23 ($227.38 total, verified to the cent).
- **Architecture decision on "my own app" vs. Telegram**: deliberately
  staying hybrid — Telegram keeps doing the one thing it's genuinely
  needed for (real push notifications, which a webpage cannot do without
  a whole separate build), the app is the real dashboard experience,
  linked/funneled from Telegram rather than replacing it. A true native
  app (not just a home-screen bookmark) was discussed and intentionally
  deferred — different scale of project, no clear need for it yet.

## Session 6 — real bug found, dashboard removed (2026-11-25)

**Real production bug found and fixed:** a real Apple Pay purchase (Panda
Express) fired the Shortcut correctly, but the Amount variable came
through empty, which crashed the "log pending purchase" step before any
notification could send — so nothing happened at all, no error visible
to Mark. Diagnosed from n8n's execution history (found the exact error:
a not-null constraint violation on `amount`). Fixed by adding a check:
if amount is missing, skip the instant-log step and ask a fuller
question instead of crashing — tested both the normal and missing-amount
paths directly to confirm. The real missed purchase was logged manually
afterward.

**Decision: drop the dashboard, stay Telegram-only for personal
automations.** Reasoning, not just preference: Mark plans to reuse this
same n8n instance for multiple future projects, so the part that needs
to be reliable is the core automation layer (Telegram, the agent, the
tools) — not a UI on top of it. The dashboard had added real surface
area for bugs (the RLS gap, two mobile CSS issues, an extra webhook path)
that pulled attention away from the core logic, which is exactly where
today's real bug was hiding. Removed: the self-hosted `/app` page, the
`Chat Webhook`/`Respond to Chat` nodes, and the three `Save ... Breakdown`
nodes that only existed to feed the now-gone dashboard's display. The
`breakdowns` Supabase table itself was left in place (harmless, unused)
rather than dropped. Confirmed core flows (Apple Pay notification,
Telegram replies) still work after the cleanup.

## Next steps (to-do list)
1. **Decide on category-level spending breakdowns** (essentials vs.
   non-essentials vs. business) — flagged as a quick add once wanted.
2. **Twitter/"new" agent** — filed under Startup System, intentionally
   not scoped yet; genuinely different from everything else since it has
   no proven manual process behind it yet.
3. **Bring back the daily-log system** (health/learned/startup/schedule)
   once finance has had real days of actual use — was deliberately
   stripped out, not abandoned, easy to restore.
4. **PRD** — Mark's own Personal-Agent-Vision-PRD v0.1 remains the
   reference for build order and future modules.
5. **Dashboard** — intentionally shelved, not abandoned. Worth revisiting
   once the core automation layer has proven itself reliable across more
   real daily use, or once there's an actual client need for a UI.
