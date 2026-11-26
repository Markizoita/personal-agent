# The Climb: game rules, screen and build instructions

Everything about the Start Up Ops game in one file. The visual is `game-the-climb.html` (open it in any browser). The rules below are what the system counts; the screen section says what the visual shows and what data it needs.

Written Thu Nov 26, 2026. Where something was my assumption and not your decision, it says so.

---

## 1. The idea

You do startup work. Every task you log earns XP. XP turns into a level that only goes up. Titles are first-time milestones you earn once and keep. The whole thing is drawn as a mountain: each title is a camp, and you climb for as long as you keep working. Nothing is required on any day, and a quiet stretch never takes anything away.

Three separate things, kept apart on purpose:

| Thing | What it is | Can it go down? |
| --- | --- | --- |
| XP and level | How much work is behind you | No |
| Powers | Four skill levels: Work, Shipping, Selling, Earning | No |
| Titles | Who you've become (first-time milestones) | No |

---

## 2. Tasks and XP (the one table to edit)

Every loggable task is a row. Power is the skill level the task feeds. Change any number whenever you want. A new price applies to new logs only, so history is never re-scored.

| Task | Power | XP | Unit |
| --- | --- | --- | --- |
| Hour worked | Work | 5 | per hour |
| Win day (proof logged) | Work | 20 | per day |
| Finished a milestone | Shipping | 25 | per time |
| Shipped something | Shipping | 50 | per time |
| Follow-up sent | Selling | 10 | per time |
| Meeting or reply booked | Selling | 20 | per time |
| Pitched someone | Selling | 30 | per time |
| Demo given | Selling | 40 | per time |
| Money earned | Earning | 100 | per $100 |

Rules:

- Logging a task adds its XP to your total and to its power. A 1-hour session where you also shipped is 5 + 50 = 55 XP.
- Money earned counts income you log tagged "startup". Assumption: it's prorated, so $50 earns 50 XP (1 XP per dollar).
- Shipped and Pitched log themselves when your proof, a finished to-do or a Claude session says so. A GitHub release counts as Shipped. There are no buttons.
- Other tasks log by typing `did <task>` in Telegram or saying it in Claude chat.
- Adding a task (for example "Posted content") is one new row. A new kind of power (for example Learning) is one more word in the Power column.

---

## 3. Level

- Level = total XP / 100, rounded down, plus one. You start at Level 1 with 0 XP.
- There is no cap and it never goes down. After Founder it keeps climbing.
- Each power has its own level, counted the same way from that power's XP.
- Shown as, for example, "Seller · Level 4".

Example: 340 XP total is Level 4, with 60 XP to Level 5.

---

## 4. Powers

Four skill levels, one per Power in the task table: Work, Selling, Shipping, Earning.

- A power you don't use just stays where it is. Not pitching for a month costs you nothing.
- They show what you're strong or weak at. They don't punish you.

---

## 5. Titles

Earned once, kept for good, and they need no XP. You can earn them in any order, so a builder can pitch before shipping anything.

| Title | How you earn it |
| --- | --- |
| Showing Up | Your first Win day |
| Builder | 5 Win days |
| Shipper | Your first Shipping task |
| Seller | Your first Selling task |
| Founder | The other four, plus your first Earning task |

- The highest title you hold is the one shown next to your level.
- Builder is "5 Win days" because "built something" is hard for the system to detect. You may prefer to mark it yourself. That's still open (see section 10).

---

## 6. Results, streak, weather and daily score

- Win: a day with proof logged.
- Showed up: 10+ minutes of work without proof.
- Miss: under 10 minutes.
- Off: a job or event day you name (`off: event`). It isn't a Miss and doesn't break the streak. Weekends count as Off unless you start the timer.
- Streak: Wins in a row, skipping Off days.
- Weather follows the streak: clear skies on a streak, clouds after a miss, a storm after two misses in a row.
- No daily hour goal. A Win is a day with proof.
- Daily score: today's XP shown next to your average day, so you can see whether today beat it. Assumption: average day = average XP over your last 14 weekdays that weren't Off. Change it if you want a different window.
- Totals start fresh at Level 1 with no title. Old Input Log data comes in later.

---

## 7. The screen (what `game-the-climb.html` shows)

Phone width, top to bottom. Sample numbers are made up so everything adds up: Work 270 XP + Selling 70 XP = 340 XP, Level 4.

1. Header: highest title and level ("Seller · Level 4"), the streak and weather on the right.
2. Level bar: 340 XP total, 60 XP to Level 5.
3. The mountain: five camps, each a title. Earned camps are lit with a check. Locked camps are dashed. The trail starts at Showing Up, goes to Builder, then forks. The left branch goes to Shipper and the right branch goes to Seller. Both branches meet at the Founder flag on the summit, so Founder visibly needs all four. A climber and a "Level 4" tag stand at the latest earned camp. Locked camps carry a short hint ("Ship once").
4. Titles card: the five titles with what each needs and a tag (Earned, 0 of 1, 3 of 4).
5. Powers card: four bars with each power's level, XP, and how far to the next level.
6. Today's climb: today's XP against your average day, then the tasks logged today. Proof missing shows "Win day +20 XP waiting".
7. This week: Mon to Sun tiles (Win, Now, Off) with XP under each day.
8. A short "How the climb works" note.

Look: Inter for text, Space Grotesk for the title. Cream page (#F6F6F3), orange accent (#C2410C), teal for earned (#0F766E). Power colors: Work teal, Selling amber (#B45309), Shipping violet (#4F46A5), Earning magenta (#9D174D).

---

## 8. Data the screen needs

One read gives the whole screen. Nothing here is stored twice: it's all counted from the existing log.

| Field | Where it comes from |
| --- | --- |
| Task table | A list in settings: name, power, XP, unit |
| Total XP, power XP | Sum of logged tasks, each at the XP it had when logged |
| Level, power levels | Counted from XP (section 3) |
| Titles earned, with date | Counted from the log (section 5) |
| Today's XP, average day | Counted from today's and recent logged tasks |
| Streak, weather, week tiles | Counted from daily results |

Keep the task table in settings so you can change it without touching code. Don't add database tables without asking.

---

## 9. Build prompt for Claude Code

Paste this after the Database prompt and the Start Up System prompt are done.

```text
CONTEXT
My personal agent: Telegram bot -> self-hosted n8n (DigitalOcean) -> Claude.
All times America/New_York. The shared database and the Start Up System already
exist (start_session, stop_session, add_todo, complete_todo, log_proof,
set_tomorrow, get_today, mark_shipped, mark_pitched). Use them; ask me before
adding tables. Don't change anything else without asking me.

GOAL
The game on top of my Start Up System: tasks earn XP, XP sets a level, four
powers have their own levels, and titles are earned once. Only n8n writes. The
Telegram form, Claude chat and the dashboard all read the same numbers.

TASKS AND XP
- Every loggable task is a row in settings: name, power (Work, Shipping, Selling
  or Earning), XP, unit (per time, per hour, per day, per $100). I can add,
  remove or re-price rows any time. A new price applies to new logs only;
  history is never re-scored.
- Starting rows: Hour worked (Work, 5, per hour); Win day (Work, 20, per day);
  Finished a milestone (Shipping, 25); Shipped something (Shipping, 50);
  Follow-up sent (Selling, 10); Meeting or reply booked (Selling, 20); Pitched
  someone (Selling, 30); Demo given (Selling, 40); Money earned (Earning, 1 XP
  per $1, income I log tagged "startup").
- Logging a task adds its XP to my total and to its power. Store the XP that
  applied at the time of logging with each log.
- Other tasks log by typing "did <task>" in Telegram or saying it in Claude chat.
  Shipped and pitched still log automatically from proof, finished to-dos and
  Claude sessions. Show what got logged in the next reply so I can undo it.

LEVEL
- Level = floor(total XP / 100) + 1, no cap, never goes down. Each power has its
  own level the same way from its own XP.

TITLES
- Earned once and kept, in any order, no XP needed: Showing Up = first Win day;
  Builder = 5 Win days; Shipper = first Shipping task; Seller = first Selling
  task; Founder = the other four plus my first Earning task.
- Save the date each title was earned. Show the highest title next to my level,
  like "Seller · Level 4".
- When a level or a title is earned, say so once in the next reply.

DAILY SCORE, STREAK, WEATHER
- Today's XP next to my average day (average XP over my last 14 weekdays that
  weren't Off).
- Streak = Wins in a row, skipping Off days.
- Weather: clear on a streak, clouds after a miss, a storm after two misses in a
  row.

TOOLS
- Add one read tool, get_game_state, that returns: total XP, level, XP to next
  level, each power's XP and level, each title with earned yes/no, its date and
  its progress (like 3 of 4), today's XP, average day, tasks logged today,
  streak, weather, and the last 7 days with their result and XP.
- Add log_task(task, quantity) for any row in the task table. Existing
  mark_shipped, mark_pitched and log_proof should call it so there is one place
  that counts XP.

TELEGRAM
- The form header shows: "Seller · Level 4 · 340 XP · Today 20 (avg 35) ·
  Streak 3".
- /game sends a short summary: title and level, XP to next level, the four
  powers, titles earned and next.

SUNDAY REVIEW
At Sunday's Breakdown add: XP this week, power levels gained, and any title
earned.

TEST
Trigger by hand: a task log at each power, a price change (old logs keep their
XP), a level up at 100 XP, a power level up, each title earned (including a
Seller before Shipper), a Founder with all four plus money, an Off day, a streak
break and the weather change, /game.

When it's done, tell me what you built and how to test it.
```

---

## 10. Still open (not decided)

These came up and you said "fine for now". Nothing is blocked on them.

- Builder: keep "5 Win days", or mark it yourself.
- Titles after Founder: named money titles ($1k deal, $5k contract, and so on) could be added later. XP already scales with money.
- More tasks: add them after the 2-week test, once you see what you actually do. Likely candidates: a reply received, a booked meeting, a finished milestone.
- Average day: the 14-weekday window in section 6 is my default.
- The Progress tab of the dashboard still shows the older rank boxes. It needs the mountain, titles and powers from this screen.

---

## 11. Where things live

- Start Up System prompt and the dashboard plan: Prompt 5 in the Build Prompts doc.
- These rules, kept current: the Levels, XP and Game doc.
- To-dos for building all of it: the Systems Plan doc (the only official to-do list).
