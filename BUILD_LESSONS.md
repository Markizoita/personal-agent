# Build lessons (n8n + Supabase + Claude agent stack)

Real bugs hit while building Wake Proof, Finance, the daily form, and
Schedule — checked against before building each new piece, not just
discovered reactively during live testing.

1. **`$now.format()` doesn't exist in Code nodes.** Luxon (what `$now` is
   there) uses `.toFormat()`. `.format()` is only valid inside `{{ }}`
   expression fields on other node types. Mixed up once, broke a passage
   generation flow silently until tested.

2. **3+ chained tool calls in one agent turn risks an infinite loop.**
   Seen twice (Wake Proof's reset→context→create chain; would have hit
   again with get_schedule_clarification→check_schedule_item→clear).
   Keep every real path to at most 2 tool calls per turn. Move anything
   that doesn't need agent judgment (a reset, a deterministic lookup) out
   of the agent's hands entirely — a plain HTTP node gated by an IF check
   on the message text, not something the agent decides to call.

3. **`$fromAI` returns the literal string `"null"` or `""` for an unset
   optional parameter, not real null/undefined.** Sending that straight
   into a numeric/boolean Postgres parameter crashes ("invalid input
   syntax"). Fix lives in SQL, not n8n: accept ambiguous optional fields
   as `text`, and defensively `nullif(nullif(trim(x), ''), 'null')` before
   casting. Don't try to sanitize this in the n8n expression itself — a
   complex wrapper around `$fromAI()` breaks whatever static parsing n8n
   uses to build the tool's schema for the LLM in the first place.

4. **Supabase blocks a bare `DELETE`/`UPDATE` with no `WHERE` clause.**
   "Clear this whole table" needs `where true`, not an omitted clause.

5. **Referencing `$('NodeName')` directly inside an AI Agent node's own
   prompt/text field behaves unreliably** (silently resolves to an empty
   prompt), even though the exact same reference works fine inside a
   plain Code node. Always route through a Code node first (set
   `$json.context`), then have the agent's prompt be just `{{ $json.context }}`.
   Every trigger path (schedule, webhook, Telegram) should funnel through
   its own small Code node that produces this same shape.

6. **An HTTP Request node receiving a raw JSON array as the response body
   turns it into multiple n8n items — zero items if the array is empty —
   which silently breaks whatever IF node comes next** (both branches get
   nothing, including the "else" you needed). Any Postgres function whose
   result feeds straight into n8n flow-control, not just an agent tool,
   must return a wrapped object (`jsonb_build_object('items', ...)`),
   never a bare array.

7. **Timezone: Supabase/Postgres defaults to UTC.** `now()`,
   `date_trunc('day', now())`, bare `::date` casts are all UTC unless
   explicitly converted. Every "today" boundary needs
   `(now() at time zone 'America/New_York')::date` — missing this made
   `get_today_total()` silently drop everything logged before 7pm ET
   once it was past UTC midnight. Audit every date/time function for this
   whenever one is added or touched.

8. **An agent needs the current TIME, not just the date, to judge
   anything time-relative** ("has this already passed", "is this
   overdue"). The system prompt only had today's date for a long stretch
   — the model wasn't ignoring instructions to fold in overdue items, it
   genuinely had no way to know what time it was. Always inject both
   date and time together for any agent reasoning about elapsed time.

9. **A "full replace" pattern (delete-all-then-reinsert) silently wipes
   state on unrelated rows** whenever it's used for an edit. `set_schedule`
   replacing the whole day's list on every edit reset status/checked_at
   on items that weren't even part of the change. Prefer matching by a
   stable key (title, id) and updating only what changed; only delete
   rows that are genuinely gone from the new list.

10. **Prompt instructions as a separate/preceding bullet get silently
    dropped**, even when reworded to sound mandatory. Models pattern-match
    hard on the literal worked EXAMPLE given right after a rule, sometimes
    harder than on the prose rule itself. Two fixes that actually worked:
    inline the instruction directly into the per-case bullet it modifies
    (not a rule floating before the list), and make sure the example
    shown concretely demonstrates the behavior, not just a case where it
    doesn't apply.

11. **Don't serve a web page from an n8n webhook.** Every webhook response
    on bot.marizo.site gets a forced `Content-Security-Policy: sandbox`
    (added upstream of n8n, so a Respond node's own headers can't undo
    it). The page's origin becomes `"null"`, so `localStorage` throws and
    the browser refuses to install it as an app. Host pages on GitHub
    Pages (`docs/`) and call the webhooks from there; CORS already
    allows it.

12. **Secrets hide in URLs, not just headers.** The Telegram Bot API puts
    the token in the path (`api.telegram.org/bot<token>/...`), so the
    header-credential cleanup missed 5 HTTP nodes, and the nightly export
    then published the token to this (public) repo. Anything that copies
    workflow JSON somewhere must redact secrets, and before making
    anything public, scan the full git history, not just the latest
    files.

## Before building the next category

Check each of the above against what's being added:
- Any new date/time math → timezone-safe, and does the agent (not just
  SQL) need current time injected to reason about it?
- Any new multi-tool chain → count real tool calls per turn, keep ≤2.
- Any new optional numeric/boolean tool parameter → text + defensive SQL.
- Any new "replace the whole list" operation → upsert by key instead.
- Any new reply-format rule → inline it, show a concrete example.
- Any new page or UI → GitHub Pages, never an n8n webhook response.
- Any new secret → `.env` + an n8n credential; never inline it in a
  node's URL or body, and never commit it (this repo is public).
- Genuinely new territory (e.g. Telegram photo messages for Notes) has
  no existing lesson to check against — look at the actual payload shape
  before guessing at its structure.
