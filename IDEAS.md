# Ideas / later (not scheduled, just tracked)

Build-side backlog - things worth doing eventually but not now. Different
from the bot's own Notes feature (that's for Mark's personal notes via
Telegram; this is for Claude Code's own build notes across sessions).

---

- **Lower-cost models for mechanical automations.** Once things get more
  complex (more workflows, more volume), consider moving the mechanical/
  low-judgment pieces (daily-form field extraction, reply formatting) to
  a cheaper/faster model than Sonnet, keeping Sonnet (or better) only on
  judgment-heavy pieces (Wake Proof's paraphrase grading, ambiguous-delete
  decisions). Test by running a cheaper model against a batch of real past
  messages and diffing its output against what Sonnet actually did -
  don't guess, compare. Low priority while volume is personal-scale (token
  savings would be small for now), but worth it once this gets reused
  across client projects where volume is real.
