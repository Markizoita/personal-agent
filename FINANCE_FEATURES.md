# Financial Automation — Full Feature List (as of 2026-11-25)

## Logging purchases
- **Manual**: text the bot anything like "14 chipotle" — logged instantly
  with amount, merchant, and a category (essentials, non-essentials,
  business, savings).
- **Automatic via Apple Pay**: tapping to pay fires a notification within
  seconds asking what it was. The amount is already locked in the moment
  you tap — your reply only fills in what it was and the category. Works
  for the ~90% of purchases that go through Apple Pay; the rest use
  manual logging.
- Covers both sources with zero duplicate-counting risk.

## Asking questions (free text, no fixed commands)
- "How much have I spent today" / "what did I buy today"
- "How much did I spend last week" / "show me November" / any date range
  you describe in plain language
- Totals are always exact — computed by the database, never estimated or
  added up by the AI itself.

## Correcting mistakes
- "Delete that $X purchase" / "remove the last one" — finds the matching
  entry and removes it, or asks which one you mean if more than one could
  match. Works on both manually-logged and Apple-Pay-logged purchases.

## Automatic scheduled reports (no need to ask)
- **Daily**, every night at 10pm: total spent, total number of
  purchases, and the itemized list.
- **Weekly**, automatically added on Sundays: same shape, last 7 days.
- **Monthly**, automatically added on the last day of the month: same
  shape, month-to-date.
- All three can fire the same night without conflicting.

## Consistent reply format
- Every finance reply comes back as a standard "Daily Form" — not a
  different sentence every time — so it's always scannable the same way:
  total spent, total purchases, itemized list, with a week/month line
  added in automatically only when relevant (Sunday/month-end).

## Dashboard (web app)
- Self-hosted at `bot.marizo.site/app` — add it to your phone's home
  screen, opens full-screen like a real app.
- Shows today's total and itemized purchases at a glance, read-only
  (updates live data each time you open it).

## Data & history
- Everything lives permanently in a real database (Supabase) — nothing
  is ever silently lost.
- Full history can be backfilled at any time: give real past data, it
  gets inserted as proper rows, immediately queryable like anything else.
- Runs 24/7 on its own server — works with your phone/laptop off.

## Not yet built (known gaps, not hidden)
- No password protection on the dashboard yet (flagged earlier, still
  open).
- No category-level breakdowns (e.g. "how much on essentials vs.
  non-essentials") — buildable quickly if wanted.
- No proactive "you're over budget" type alerts — only reports what
  happened, doesn't yet judge it against a target.
