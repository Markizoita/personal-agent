require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_learned1.json`);

const d = JSON.parse(fs.readFileSync('workflow_learned1.json', 'utf8'));
const SB_URL = 'https://hzwmypoifzazhekzbpos.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

function sbHeaders(extra) {
  return { parameters: [
    { name: 'apikey', value: SB_KEY },
    { name: 'Authorization', value: 'Bearer ' + SB_KEY },
    ...(extra || [])
  ] };
}

function tool(name, desc, rpc, jsonBody, pos) {
  return {
    parameters: {
      toolDescription: desc,
      method: 'POST',
      url: SB_URL + '/rest/v1/rpc/' + rpc,
      sendHeaders: true,
      headerParameters: sbHeaders([{ name: 'Content-Type', value: 'application/json' }]),
      sendBody: true,
      specifyBody: 'json',
      jsonBody,
      options: {}
    },
    type: 'n8n-nodes-base.httpRequestTool',
    typeVersion: 4.5,
    position: pos,
    id: 'ln000001-0001-4000-8000-' + name.padStart(12, '0').slice(0, 12),
    name
  };
}

const findLearnedItem = tool('find_learned_item',
  "Searches learned items (podcasts/books) by a word from the title. Call this FIRST whenever Mark refers to an existing item by a short/partial name (e.g. 'lex', 'diary', 'atomic habits') - before adding time, setting a position, or marking finished. Returns matching items with their id, title, type, total, current progress, and status.",
  'find_learned_item',
  "={{ JSON.stringify({ p_query: $fromAI('query', 'a word or phrase from the title to search for', 'string') }) }}",
  [3408, 144]);

const createLearnedItem = tool('create_learned_item',
  "Creates a new podcast or book entry. Only call this when the item doesn't already exist (check find_learned_item first if the title sounds like it might already be tracked). p_total is the total minutes (podcast) or pages (book) if known, otherwise leave blank. p_initial is the starting position (minutes or page), if given, otherwise leave blank (defaults to 0).",
  'create_learned_item',
  "={{ JSON.stringify({ p_title: $fromAI('title', 'the podcast or book title', 'string'), p_type: $fromAI('type', \"'podcast' or 'book'\", 'string'), p_total: $fromAI('total', 'total minutes (podcast) or total pages (book), if known', 'string'), p_initial: $fromAI('initial', 'the starting minute or page position, if given', 'string') }) }}",
  [3568, 144]);

const updateLearnedProgress = tool('update_learned_progress',
  "Updates an existing item's progress. p_mode 'add' adds p_value to the current progress (for '+30 diary' style messages). p_mode 'set' sets the current progress to exactly p_value (for 'p. 85' style exact-position messages). p_takeaway is optional - only pass it if Mark gave one.",
  'update_learned_progress',
  "={{ JSON.stringify({ p_item_id: $fromAI('item_id', 'the item id from find_learned_item', 'number'), p_mode: $fromAI('mode', \"'add' or 'set'\", 'string'), p_value: $fromAI('value', 'the amount to add, or the exact position to set, in minutes or pages', 'number'), p_takeaway: $fromAI('takeaway', 'a one-line takeaway, only if Mark gave one', 'string') }) }}",
  [3728, 144]);

const finishLearnedItem = tool('finish_learned_item',
  "Marks an item as finished. Call find_learned_item first to get its id.",
  'finish_learned_item',
  "={{ JSON.stringify({ p_item_id: $fromAI('item_id', 'the item id to mark finished', 'number') }) }}",
  [3888, 144]);

const getBookmarks = tool('get_bookmarks',
  "Gets all in-progress podcasts/books with current progress and when each was last updated. Call this for 'bookmarks' or '/bookmarks'.",
  'get_bookmarks',
  '{}',
  [4048, 144]);

const getLearnedWeek = tool('get_learned_week',
  "Gets this week's totals: podcast minutes, pages read, and titles finished this week. Call this for '/learned'.",
  'get_learned_week',
  '{}',
  [4208, 144]);

const tools = [findLearnedItem, createLearnedItem, updateLearnedProgress, finishLearnedItem, getBookmarks, getLearnedWeek];
d.nodes.push(...tools);
for (const t of tools) {
  d.connections[t.name] = { ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]] };
}

const agent = d.nodes.find(n => n.name === 'AI Agent');
let prompt = agent.parameters.options.systemMessage;

// ---------- Add Learned section before /today ----------
const marker = '## /today and /form commands';
const learnedSection = `## Learned (podcasts/books)
This is a free-form log, not a target - there's no minimum, no "good" or "bad" amount, just what Mark actually did. Checking in about it is a gentle reminder to log something if he did, never a demand that he must have.

Logging something NEW: a title + a number of hours/pages + a starting spot (e.g. "diary of a ceo, 4 hours, at 1:10", "atomic habits, 320 pages, p. 40") -> call find_learned_item first to make sure it doesn't already exist, then create_learned_item (type 'podcast' for hours/minutes, 'book' for pages). Convert hours to minutes and "1:10" (h:mm) style spots to minutes for storage (e.g. "4 hours" -> 240, "1:10" -> 70) - pages stay as plain numbers. Reply with: "🎧 <title> · <current as h:mm> of <total as h:mm>" (podcast) or "📖 <title> · p. <current> of <total>" (book).

Adding time/pages to an EXISTING item ("+30 diary"): call find_learned_item with the given word first.
- No match: say you couldn't find anything matching that, ask if it's a new item.
- Exactly one match: call update_learned_progress with mode 'add' and that item's id, then reply the same shape as above.
- More than one match: list them as options ("1) Lex Fridman #450  2) Lex Fridman #451") and ask which one - your NEXT reply, once Mark picks, should use conversation history to know which id that was (do not guess, do not re-ask unless genuinely unclear).

Setting an EXACT spot, optionally with a takeaway ("atomic habits p. 85, takeaway: small habits compound"): find_learned_item, then update_learned_progress with mode 'set' and p_value the exact position, passing p_takeaway if one was given. Reply with the same shape, plus "· takeaway saved" at the end if one was included.

Finishing ("finished diary"): find_learned_item, then finish_learned_item with that id. Reply "✅ Finished: <title>".

"bookmarks" or "/bookmarks": call get_bookmarks, reply with one line per in-progress item: "🎧/📖 <title> · <current> of <total> · <last_updated_label>".

"/learned": call get_learned_week, reply:
Learned · this week
- Podcasts: <podcast_minutes as h:mm>
- Pages read: <pages>
- Finished: <finished titles, comma separated, or "none" if empty>

Distinguishing from Start Up: Start Up logging only applies when Mark explicitly says "startup"/"build"/"plan" - a title + hours/pages/p. with no mention of those words is Learned, not Start Up, even though both can mention "hours".

${marker}`;

if (!prompt.includes(marker)) {
  console.log('MARKER (learned insert point) NOT FOUND - aborting');
  process.exit(1);
}
prompt = prompt.replace(marker, learnedSection.trim() + '\n\n' + marker);

// ---------- Update check-ins to include Learned (ask, or state if already logged today) ----------
prompt = prompt.replace(
  '- 8 AM: ask "sleep last night? · breakfast?" unless both already logged (then state them instead).',
  '- 8 AM: ask "sleep last night? · breakfast?" unless both already logged (then state them instead). Learned: if learned_today has entries, state them ("Learned: <title> +<delta>, now <current> of <total>" per item); otherwise ask once, no pressure: "anything read or listened to?"'
);
prompt = prompt.replace(
  '- 2 PM: ask "food since 8?" unless already answered since 8am.',
  '- 2 PM: ask "food since 8?" unless already answered since 8am. Learned: same as 8 AM - state learned_today entries if present, otherwise ask "anything read or listened to since this morning?"'
);
prompt = prompt.replace(
  '- 5 PM: same shape as 2 PM, "food since 2?".',
  '- 5 PM: same shape as 2 PM, "food since 2?". Learned: same pattern as above.'
);
prompt = prompt.replace(
  '- 10 PM Breakdown: ask only for whichever of these is still missing - food since 5 PM, gym ✅/⬜ (Start Up and Mood are both paused for now - don\'t ask about either or show them in the Breakdown or /today, even though their fields still exist).',
  '- 10 PM Breakdown: ask only for whichever of these is still missing - food since 5 PM, gym ✅/⬜, and (gently, no pressure) anything read or listened to if learned_today is still empty (Start Up and Mood are both paused for now - don\'t ask about either or show them in the Breakdown or /today, even though their fields still exist).'
);

// Add Learned to the whole-form order (after Notes, matching Mark's "at the bottom")
prompt = prompt.replace(
  '5. #### Notes (notes_today - list each as "#<id> <text> · <tags>"; say "none today" if notes_today is empty)',
  '5. #### Notes (notes_today - list each as "#<id> <text> · <tags>"; say "none today" if notes_today is empty)\n6. #### Learned (learned_today - list each as "<title> +<delta>, now <current> of <total>"; say "nothing logged today" if empty - never flagged as missing, just shown)'
);

agent.parameters.options.systemMessage = prompt;
console.log('learned section added:', prompt.includes('## Learned (podcasts/books)'));
console.log('checkins updated:', prompt.includes('anything read or listened to since this morning'));
console.log('whole-form updated:', prompt.includes('6. #### Learned'));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_learned1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
