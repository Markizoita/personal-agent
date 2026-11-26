# Personal AI Agent Team — Build Plan (n8n + Telegram)

## Goal
Learn AI agents/automation by building, fast — not studying theory first.
End goal: personal agent team (one per life category) as proof of concept,
then pitch/start an AI agent automation agency for businesses.

## Philosophy
- Speed over expertise. Learn only what's needed, when it's needed.
- Build the raw agent loop once by hand (LLM + tool + loop) so every
  framework/platform after that is understandable, not a mystery box.
- Skip for now: vector DBs/RAG, LangGraph/CrewAI-style multi-agent
  frameworks, fine-tuning, enterprise AI platforms.

## Stack decision
- **n8n**, self-hosted via Docker (not Make/Zapier) — self-hostable,
  native AI Agent nodes, more credible to show future clients.
- **Telegram** as the phone interface — gives a "Muse-style" chat app
  with push notifications, with zero app-building/App Store hassle.
- Drop into Python/code only when n8n's node UI can't do something
  (learn-as-needed, not pre-studied).

## Architecture
Telegram (phone UI) <-> n8n (the brain/backend) <-> tools (Sheets,
Calendar, Gmail, etc.)

One Telegram bot, multiple n8n workflows underneath — feels like one
assistant, each life category is its own workflow + toolset.

## Build steps
1. Docker: `docker run -it --rm --name n8n -p 5678:5678 -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n`
2. Open localhost:5678, create owner account
3. Create Telegram bot via @BotFather -> /newbot -> get API token
4. n8n workflow: Telegram Trigger -> AI Agent node -> Telegram (reply) node
5. Connect AI Agent to a Chat Model (Claude/OpenAI API key)
6. Add tools to the AI Agent node scoped to ONE category first (start: finance)
7. Add Memory to the AI Agent node so it holds conversation context
8. Separate workflow: Schedule Trigger (e.g. 11pm) -> AI Agent evaluates
   data -> only messages Telegram if something's actually off (proactive,
   not just a fixed notification)
9. Repeat per life category (calendar/inbox triage, tasks, etc.), same bot

## Next milestone
2-3 working personal agents = proof of concept to pitch the agency idea.
