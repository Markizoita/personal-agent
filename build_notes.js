require('./env');
const fs = require('fs');
const { execSync } = require('child_process');
const KEY = process.env.N8N_API_KEY;
execSync(`curl -s "https://bot.marizo.site/api/v1/workflows/lULFqqQFMNb8byt2" -H "X-N8N-API-KEY: ${KEY}" -o workflow_notes1.json`);

const d = JSON.parse(fs.readFileSync('workflow_notes1.json', 'utf8'));
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
    id: 'nt000001-0001-4000-8000-' + name.padStart(12, '0').slice(0, 12),
    name
  };
}

const saveNote = tool('save_note',
  "Saves a new note. Call this once per note. Returns the new note's id and tags.",
  'save_note',
  "={{ JSON.stringify({ p_text: $fromAI('text', 'the note text, with the note:/ /note trigger stripped off - just the content itself', 'string'), p_tags: $fromAI('tags', 'a JSON array of 1-3 short lowercase tags for this note, e.g. [\"idea\",\"startup\"]', 'json') }) }}",
  [2448, 144]);

const searchNotes = tool('search_notes',
  "Gets notes, optionally filtered. Leave the query blank for the last 10 notes (use for /notes with no search term). Pass a word or tag to search by it (matches note text or tags). Also use this to answer a plain question about past notes.",
  'search_notes',
  "={{ JSON.stringify({ p_query: $fromAI('query', 'a search word or tag, if Mark is searching/asking about something specific - otherwise leave blank for the last 10 notes', 'string') }) }}",
  [2608, 144]);

const editNote = tool('edit_note',
  "Replaces one note's text (and optionally its tags). Call once with the note's id and the new text.",
  'edit_note',
  "={{ JSON.stringify({ p_id: $fromAI('id', 'the note id to edit', 'number'), p_text: $fromAI('text', 'the new note text', 'string'), p_tags: $fromAI('tags', 'updated tags as a JSON array, only if they should change - otherwise leave blank to keep the existing tags', 'json') }) }}",
  [2768, 144]);

const setPendingNoteDelete = tool('set_pending_note_delete',
  "Call this right before asking Mark to confirm deleting a note - records which note id you're waiting on a yes for.",
  'set_pending_note_delete',
  "={{ JSON.stringify({ p_note_id: $fromAI('note_id', 'the note id pending delete confirmation', 'number') }) }}",
  [2928, 144]);

const getPendingNoteDelete = tool('get_pending_note_delete',
  "Checks whether Mark is confirming a note delete you asked about in your previous reply. Call this first whenever a short message (yes/no/confirm/etc) could be answering a pending delete confirmation.",
  'get_pending_note_delete',
  '{}',
  [3088, 144]);

const deleteNoteTool = tool('delete_note',
  "Permanently deletes one note by id. Only call this after Mark has confirmed (see get_pending_note_delete) - never on the first delete request.",
  'delete_note',
  "={{ JSON.stringify({ p_id: $fromAI('id', 'the note id to delete, already confirmed', 'number') }) }}",
  [3248, 144]);

const tools = [saveNote, searchNotes, editNote, setPendingNoteDelete, getPendingNoteDelete, deleteNoteTool];
d.nodes.push(...tools);
for (const t of tools) {
  d.connections[t.name] = { ai_tool: [[{ node: 'AI Agent', type: 'ai_tool', index: 0 }]] };
}

const agent = d.nodes.find(n => n.name === 'AI Agent');
let prompt = agent.parameters.options.systemMessage;

const marker = '## /today and /form commands';
const notesSection = `## Notes
Notes are completely separate from everything above - no pings, never shown on the daily form, never mixed into a check-in.

Saving: if a message starts with "note:" or "/note " followed by content (not "edit"/"delete"), strip that trigger off and call save_note with just the remaining text, plus 1-3 short lowercase tags you pick for it (like idea, startup, health, money, people). Reply with ONLY: "📝 Saved #<id> · <tags, comma separated>" - nothing else, no commentary.

Finding: "/notes" with nothing after it -> call search_notes with no query, show the last 10 as one line each: "#<id> <date> · <text> · <tags>". "/notes <word or tag>" -> call search_notes with that as the query, same format. A plain question about past notes ("what did I note about pricing?", "notes from last week") -> call search_notes with the key word from the question, then answer directly from what it returns (quote or summarize the matching note(s)) rather than just listing them - if nothing matches, say so plainly.

Editing: "/note edit <id> <new text>" -> call edit_note with that id and text, then reply "📝 Updated #<id>".

Deleting: "/note delete <id>" -> call set_pending_note_delete with that id, then ask "Delete #<id>? Reply yes to confirm." - do not delete yet. If a later short message (yes/no/confirm/etc.) arrives, call get_pending_note_delete FIRST; if it shows a pending id, treat "yes"/"y"/"confirm" as confirming (call delete_note with that id, then reply "Deleted #<id>."), and anything negative ("no", "cancel", "nevermind") as declining (say you left it alone, no tool call needed). If get_pending_note_delete shows nothing pending, a bare "yes" isn't about a note delete - treat it per whatever else might be pending, or respond naturally.

${marker}`;

if (!prompt.includes(marker)) {
  console.log('MARKER NOT FOUND - aborting');
  process.exit(1);
}
prompt = prompt.replace(marker, notesSection);
agent.parameters.options.systemMessage = prompt;
console.log('notes section added:', prompt.includes('## Notes'));

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_notes1.json', JSON.stringify(payload));
console.log('nodeCount:', payload.nodes.length);
