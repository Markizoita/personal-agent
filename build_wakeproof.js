require('./env');
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('workflow_current.json', 'utf8'));

const SB_URL = 'https://hzwmypoifzazhekzbpos.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TG_CRED = { id: '8H0hBfrPobhcvfBu', name: 'Telegram account' };
const ANTHROPIC_CRED = { id: '88N30wTkVWAww665', name: 'Anthropic account' };

function sbHeaders(extra) {
  return {
    parameters: [
      { name: 'apikey', value: SB_KEY },
      { name: 'Authorization', value: 'Bearer ' + SB_KEY },
      ...(extra || [])
    ]
  };
}

// ---------- Wake Agent system prompt ----------
const wakeSystemPrompt = `=You are Mark's Wake Proof assistant, running through Telegram. This is a separate job from his finance assistant - only handle wake-proof passages, grading, streaks, and the /wake, /skip, /testwake commands, nothing about spending. Today's date is {{ $now.format('M/d/yy') }} (ISO: {{ $now.format('yyyy-MM-dd') }}).

Every message you receive is a SYSTEM instruction telling you exactly what to do right now - follow it using the tools available.

## Generating a passage
- Call get_wake_context first and look at the passage_text values from the last 60 days - do not repeat any of them.
- Mix it up: some days a single line, some days a few lines, some days a short story (up to about 8 sentences).
- Quote the passage EXACTLY, word for word, from one of these public-domain sources only:
  - Marcus Aurelius, Meditations (George Long translation)
  - Seneca, Letters (Gummere translation)
  - Epictetus, Enchiridion (Higginson or Oldfather translation)
  - Short anecdotes: Seneca's Letters, Plutarch's Lives (Dryden/Clough translation), Diogenes Laertius on the Stoics (Hicks translation), or Aesop's Fables
  - Motivational, public-domain (published before 1929): e.g. Emerson's Self-Reliance, Thoreau's Walden
- Pick passages about action, discipline, time, fear, getting up and doing the work.
- Name the author and book right after the quote.
- End with exactly: "Tell it back: what was it about?"
- Call create_wake_day with the exact passage text and the source citation.
- Output ONLY the passage + citation + that closing line - nothing else, no preamble, no commentary.

## Grading a reply
You'll be told which attempt this is (1 or 2) and given the exact reply text. Grade it against the passage from get_wake_context's most recent (today's) row.
- PASS if Mark explains the main idea in his own words. For a story, he should get what happened and the point of it. A sentence or two is enough for a line; a few sentences for a story. Be lenient - any reasonable reading counts.
- FAIL if he copies or closely rewords the passage, gets it clearly wrong, or just sends something like "ok", "done", "read it" with no real explanation.
- Call submit_wake_grade with passed=true or passed=false. Its response carries the real result (on_time/late) and the real streak_current/streak_best - always use those exact numbers, never compute your own.
- If passed=true, reply with exactly this shape (fill in real numbers from the tool's response, no flattery, no extra commentary):
"✅ Woke at 7, logged <reply time like 7:08> · Streak: <streak_current> days (best: <streak_best>)"
then one line that sharpens the main idea of the passage.
If streak_current is exactly 7, 14, 30, 60, or 100, add one short extra line marking that milestone.
If the tool's result came back "late" instead of "on_time", say so plainly instead of "Woke at 7" - e.g. "Logged late at <time> · Streak reset to 0 (best: <streak_best>)".
- If passed=false and this is attempt 1: give one short, specific hint (point at what he's missing without giving the answer away) and ask him to try again - mention it still has to land by 7:30.
- If passed=false and this is attempt 2: tell him plainly that was the retry and there are no more chances today - don't mention a streak number, that resolves automatically at 7:30 if nothing else comes in.

## /wake command
Call get_wake_context. Reply with today's result (say "not sent yet" or "pending" if there's no row today or it's not graded yet), current streak, best streak, and the last 7 days as one short line each (date - result).

## /skip command
Call mark_wake_skip. If the response has ok:true, confirm today is logged as a planned day off and the streak is unaffected. If ok:false, say why (today already has an entry, or this week's skip is already used) - never call it a second time in the same reply.

## /testwake command
Call reset_wake_day_for_test first, then generate and send a passage exactly as described in "Generating a passage" above.

Never discuss spending or purchases - that's a different assistant with its own job. If Mark says something that isn't covered by the instruction you were given, just respond briefly and naturally.`;

// ---------- Wake Agent + its own Chat Model ----------
const wakeAgent = {
  parameters: {
    promptType: 'define',
    text: '={{ $json.context }}',
    options: { systemMessage: wakeSystemPrompt }
  },
  type: '@n8n/n8n-nodes-langchain.agent',
  typeVersion: 1.9,
  position: [928, 1140],
  id: 'ww000001-0001-4000-8000-000000000001',
  name: 'Wake Agent'
};

const wakeModel = {
  parameters: { model: { __rl: true, mode: 'list', value: 'claude-sonnet-5', cachedResultName: 'Claude Sonnet 5' }, options: {} },
  type: '@n8n/n8n-nodes-langchain.lmChatAnthropic',
  typeVersion: 1.6,
  position: [880, 1340],
  id: 'ww000001-0001-4000-8000-000000000002',
  name: 'Wake Anthropic Chat Model',
  credentials: { anthropicApi: ANTHROPIC_CRED }
};

// ---------- Wake Agent tools ----------
const getWakeContext = {
  parameters: {
    toolDescription: "Gets the last 60 days of Wake Proof history: passage text/source, send time, both reply attempts, result, and streak numbers, newest first. Call this before generating a passage (to avoid repeats) or grading a reply (to see today's passage and the current streak), and for the /wake command.",
    method: 'GET',
    url: SB_URL + '/rest/v1/wake_proof?order=log_date.desc&limit=60',
    sendHeaders: true,
    headerParameters: sbHeaders(),
    options: {}
  },
  type: 'n8n-nodes-base.httpRequestTool',
  typeVersion: 4.5,
  position: [688, 1460],
  id: 'ww000001-0001-4000-8000-000000000003',
  name: 'get_wake_context'
};

const createWakeDay = {
  parameters: {
    toolDescription: "Creates today's Wake Proof entry with the passage you generated. Call this once, right after choosing today's passage.",
    method: 'POST',
    url: SB_URL + '/rest/v1/rpc/create_wake_day',
    sendHeaders: true,
    headerParameters: sbHeaders([{ name: 'Content-Type', value: 'application/json' }]),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ p_log_date: $json.log_date, p_passage: $fromAI('passage', 'the exact passage text, word for word', 'string'), p_source: $fromAI('source', 'the author and book citation, e.g. Marcus Aurelius, Meditations', 'string') }) }}",
    options: {}
  },
  type: 'n8n-nodes-base.httpRequestTool',
  typeVersion: 4.5,
  position: [848, 1460],
  id: 'ww000001-0001-4000-8000-000000000004',
  name: 'create_wake_day'
};

const submitWakeGrade = {
  parameters: {
    toolDescription: "Records the grade for the reply you were just given (pass or fail) and returns the real result and streak numbers - always use exactly what this returns, never compute your own streak.",
    method: 'POST',
    url: SB_URL + '/rest/v1/rpc/grade_wake_reply',
    sendHeaders: true,
    headerParameters: sbHeaders([{ name: 'Content-Type', value: 'application/json' }]),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ p_log_date: $json.log_date, p_attempt: $json.attempt, p_reply_text: $json.reply_text, p_passed: $fromAI('passed', 'true if Mark correctly explained the main idea in his own words (be lenient, any reasonable reading counts); false if he copied/reworded the passage, got it clearly wrong, or just said something like ok/done/read it', 'boolean') }) }}",
    options: {}
  },
  type: 'n8n-nodes-base.httpRequestTool',
  typeVersion: 4.5,
  position: [1008, 1460],
  id: 'ww000001-0001-4000-8000-000000000005',
  name: 'submit_wake_grade'
};

const markWakeSkip = {
  parameters: {
    toolDescription: "Marks today as a planned skip day (max once a week), carrying the streak forward unchanged. Only call this for the /skip command.",
    method: 'POST',
    url: SB_URL + '/rest/v1/rpc/mark_wake_skip',
    sendHeaders: true,
    headerParameters: sbHeaders([{ name: 'Content-Type', value: 'application/json' }]),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '={{ JSON.stringify({ p_log_date: $json.log_date }) }}',
    options: {}
  },
  type: 'n8n-nodes-base.httpRequestTool',
  typeVersion: 4.5,
  position: [1168, 1460],
  id: 'ww000001-0001-4000-8000-000000000006',
  name: 'mark_wake_skip'
};

const resetWakeDayForTest = {
  parameters: {
    toolDescription: "Deletes today's Wake Proof entry so it can be generated fresh. Only call this for the /testwake command, as the very first step.",
    method: 'POST',
    url: SB_URL + '/rest/v1/rpc/reset_wake_day_for_test',
    sendHeaders: true,
    headerParameters: sbHeaders([{ name: 'Content-Type', value: 'application/json' }]),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '={{ JSON.stringify({ p_log_date: $json.log_date }) }}',
    options: {}
  },
  type: 'n8n-nodes-base.httpRequestTool',
  typeVersion: 4.5,
  position: [1328, 1460],
  id: 'ww000001-0001-4000-8000-000000000007',
  name: 'reset_wake_day_for_test'
};

// ---------- Routing (Telegram Trigger -> Wake Agent or Finance AI Agent) ----------
const checkWakeRouting = {
  parameters: {
    method: 'POST',
    url: SB_URL + '/rest/v1/rpc/get_wake_routing',
    sendHeaders: true,
    headerParameters: sbHeaders([{ name: 'Content-Type', value: 'application/json' }]),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '{}',
    options: {}
  },
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [128, -176],
  id: 'ww000001-0001-4000-8000-000000000008',
  name: 'Check Wake Routing',
  retryOnFail: true,
  maxTries: 3,
  waitBetweenTries: 2000
};

const routeToWake = {
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 1 },
      conditions: [
        {
          id: 'cond1',
          leftValue: "={{ ($json.pending || /^\\/(wake|skip|testwake)\\b/i.test($('Telegram Trigger').item.json.message.text || '')) ? 1 : 0 }}",
          rightValue: '={{ 1 }}',
          operator: { type: 'number', operation: 'equals' }
        }
      ],
      combinator: 'and'
    },
    options: {}
  },
  type: 'n8n-nodes-base.if',
  typeVersion: 2.2,
  position: [320, -176],
  id: 'ww000001-0001-4000-8000-000000000009',
  name: 'Route to Wake?'
};

const buildWakeReplyContext = {
  parameters: {
    jsCode: `const msgText = $('Telegram Trigger').item.json.message.text || '';
const routing = $json;
const today = $now.toFormat('yyyy-MM-dd');
let context;
if (/^\\/wake\\b/i.test(msgText.trim())) {
  context = "SYSTEM: Mark sent /wake. Follow the /wake command instructions.";
} else if (/^\\/skip\\b/i.test(msgText.trim())) {
  context = "SYSTEM: Mark sent /skip. Follow the /skip command instructions.";
} else if (/^\\/testwake\\b/i.test(msgText.trim())) {
  context = "SYSTEM: Mark sent /testwake. Follow the /testwake command instructions.";
} else {
  context = 'Mark\\'s reply to grade (attempt ' + (routing.attempt || 1) + '): "' + msgText + '"';
}
return [{ json: { context, mode: 'reply', attempt: routing.attempt || 1, reply_text: msgText, log_date: today } }];`
  },
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [512, -280],
  id: 'ww000001-0001-4000-8000-00000000000a',
  name: 'Build Wake Reply Context'
};

// ---------- 7:05 passage send ----------
const wake0705Trigger = {
  parameters: { rule: { interval: [{ field: 'cronExpression', expression: '5 7 * * *' }] } },
  type: 'n8n-nodes-base.scheduleTrigger',
  typeVersion: 1.2,
  position: [-96, 1200],
  id: 'ww000001-0001-4000-8000-00000000000b',
  name: 'Wake 7:05am'
};

const checkWakeSendStatus = {
  parameters: {
    method: 'POST',
    url: SB_URL + '/rest/v1/rpc/get_wake_send_status',
    sendHeaders: true,
    headerParameters: sbHeaders([{ name: 'Content-Type', value: 'application/json' }]),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '{}',
    options: {}
  },
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [96, 1200],
  id: 'ww000001-0001-4000-8000-00000000000c',
  name: 'Check Wake Send Status',
  retryOnFail: true,
  maxTries: 3,
  waitBetweenTries: 2000
};

const alreadySent = {
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 1 },
      conditions: [
        {
          id: 'cond1',
          leftValue: '={{ $json.already_exists ? 1 : 0 }}',
          rightValue: '={{ 1 }}',
          operator: { type: 'number', operation: 'equals' }
        }
      ],
      combinator: 'and'
    },
    options: {}
  },
  type: 'n8n-nodes-base.if',
  typeVersion: 2.2,
  position: [288, 1200],
  id: 'ww000001-0001-4000-8000-00000000000d',
  name: 'Already Sent?'
};

const buildWakePassageContext = {
  parameters: {
    jsCode: `const today = $now.toFormat('yyyy-MM-dd');
const context = "SYSTEM: Generate and send today's Wake Proof passage now. Follow the Generating a passage instructions.";
return [{ json: { context, mode: 'passage', log_date: today } }];`
  },
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [480, 1280],
  id: 'ww000001-0001-4000-8000-00000000000e',
  name: 'Build Wake Passage Context'
};

// ---------- 7:15 nudge ----------
const wake0715Trigger = {
  parameters: { rule: { interval: [{ field: 'cronExpression', expression: '15 7 * * *' }] } },
  type: 'n8n-nodes-base.scheduleTrigger',
  typeVersion: 1.2,
  position: [-96, 1500],
  id: 'ww000001-0001-4000-8000-00000000000f',
  name: 'Wake 7:15 Nudge'
};

const checkNudgeStatus = {
  parameters: {
    method: 'POST',
    url: SB_URL + '/rest/v1/rpc/get_wake_nudge_status',
    sendHeaders: true,
    headerParameters: sbHeaders([{ name: 'Content-Type', value: 'application/json' }]),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '{}',
    options: {}
  },
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [96, 1500],
  id: 'ww000001-0001-4000-8000-000000000010',
  name: 'Check Nudge Status',
  retryOnFail: true,
  maxTries: 3,
  waitBetweenTries: 2000
};

const needNudge = {
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 1 },
      conditions: [
        {
          id: 'cond1',
          leftValue: '={{ $json.need_nudge ? 1 : 0 }}',
          rightValue: '={{ 1 }}',
          operator: { type: 'number', operation: 'equals' }
        }
      ],
      combinator: 'and'
    },
    options: {}
  },
  type: 'n8n-nodes-base.if',
  typeVersion: 2.2,
  position: [288, 1500],
  id: 'ww000001-0001-4000-8000-000000000011',
  name: 'Need Nudge?'
};

const sendWakeNudge = {
  parameters: {
    chatId: CHAT_ID,
    text: 'Still waiting on today\'s read.',
    additionalFields: {}
  },
  type: 'n8n-nodes-base.telegram',
  typeVersion: 1.2,
  position: [480, 1500],
  id: 'ww000001-0001-4000-8000-000000000012',
  name: 'Send Wake Nudge',
  retryOnFail: true,
  maxTries: 3,
  waitBetweenTries: 2000,
  credentials: { telegramApi: TG_CRED }
};

// ---------- 7:30 cutoff ----------
const wake0730Trigger = {
  parameters: { rule: { interval: [{ field: 'cronExpression', expression: '30 7 * * *' }] } },
  type: 'n8n-nodes-base.scheduleTrigger',
  typeVersion: 1.2,
  position: [-96, 1650],
  id: 'ww000001-0001-4000-8000-000000000013',
  name: 'Wake 7:30 Cutoff'
};

const checkCutoffStatus = {
  parameters: {
    method: 'POST',
    url: SB_URL + '/rest/v1/rpc/get_wake_cutoff_status',
    sendHeaders: true,
    headerParameters: sbHeaders([{ name: 'Content-Type', value: 'application/json' }]),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '{}',
    options: {}
  },
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [96, 1650],
  id: 'ww000001-0001-4000-8000-000000000014',
  name: 'Check Cutoff Status',
  retryOnFail: true,
  maxTries: 3,
  waitBetweenTries: 2000
};

const needsMiss = {
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 1 },
      conditions: [
        {
          id: 'cond1',
          leftValue: '={{ $json.needs_miss ? 1 : 0 }}',
          rightValue: '={{ 1 }}',
          operator: { type: 'number', operation: 'equals' }
        }
      ],
      combinator: 'and'
    },
    options: {}
  },
  type: 'n8n-nodes-base.if',
  typeVersion: 2.2,
  position: [288, 1650],
  id: 'ww000001-0001-4000-8000-000000000015',
  name: 'Needs Miss?'
};

const finalizeMiss = {
  parameters: {
    method: 'POST',
    url: SB_URL + '/rest/v1/rpc/finalize_wake_day',
    sendHeaders: true,
    headerParameters: sbHeaders([{ name: 'Content-Type', value: 'application/json' }]),
    sendBody: true,
    specifyBody: 'json',
    jsonBody: "={{ JSON.stringify({ p_log_date: $now.format('yyyy-MM-dd'), p_result: 'miss' }) }}",
    options: {}
  },
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [480, 1650],
  id: 'ww000001-0001-4000-8000-000000000016',
  name: 'Finalize Miss',
  retryOnFail: true,
  maxTries: 3,
  waitBetweenTries: 2000
};

// ---------- wire it all together ----------
d.nodes.push(
  wakeAgent, wakeModel, getWakeContext, createWakeDay, submitWakeGrade, markWakeSkip, resetWakeDayForTest,
  checkWakeRouting, routeToWake, buildWakeReplyContext,
  wake0705Trigger, checkWakeSendStatus, alreadySent, buildWakePassageContext,
  wake0715Trigger, checkNudgeStatus, needNudge, sendWakeNudge,
  wake0730Trigger, checkCutoffStatus, needsMiss, finalizeMiss
);

// Rewire Telegram Trigger -> Check Wake Routing (was -> AI Agent)
d.connections['Telegram Trigger'] = { main: [[{ node: 'Check Wake Routing', type: 'main', index: 0 }]] };
d.connections['Check Wake Routing'] = { main: [[{ node: 'Route to Wake?', type: 'main', index: 0 }]] };
d.connections['Route to Wake?'] = {
  main: [
    [{ node: 'Build Wake Reply Context', type: 'main', index: 0 }],
    [{ node: 'AI Agent', type: 'main', index: 0 }]
  ]
};
d.connections['Build Wake Reply Context'] = { main: [[{ node: 'Wake Agent', type: 'main', index: 0 }]] };

d.connections['Wake Agent'] = { main: [[{ node: 'Send a text message', type: 'main', index: 0 }]] };
d.connections['Wake Anthropic Chat Model'] = { ai_languageModel: [[{ node: 'Wake Agent', type: 'ai_languageModel', index: 0 }]] };
for (const t of ['get_wake_context', 'create_wake_day', 'submit_wake_grade', 'mark_wake_skip', 'reset_wake_day_for_test']) {
  d.connections[t] = { ai_tool: [[{ node: 'Wake Agent', type: 'ai_tool', index: 0 }]] };
}

d.connections['Wake 7:05am'] = { main: [[{ node: 'Check Wake Send Status', type: 'main', index: 0 }]] };
d.connections['Check Wake Send Status'] = { main: [[{ node: 'Already Sent?', type: 'main', index: 0 }]] };
d.connections['Already Sent?'] = { main: [[], [{ node: 'Build Wake Passage Context', type: 'main', index: 0 }]] };
d.connections['Build Wake Passage Context'] = { main: [[{ node: 'Wake Agent', type: 'main', index: 0 }]] };

d.connections['Wake 7:15 Nudge'] = { main: [[{ node: 'Check Nudge Status', type: 'main', index: 0 }]] };
d.connections['Check Nudge Status'] = { main: [[{ node: 'Need Nudge?', type: 'main', index: 0 }]] };
d.connections['Need Nudge?'] = { main: [[{ node: 'Send Wake Nudge', type: 'main', index: 0 }], []] };

d.connections['Wake 7:30 Cutoff'] = { main: [[{ node: 'Check Cutoff Status', type: 'main', index: 0 }]] };
d.connections['Check Cutoff Status'] = { main: [[{ node: 'Needs Miss?', type: 'main', index: 0 }]] };
d.connections['Needs Miss?'] = { main: [[{ node: 'Finalize Miss', type: 'main', index: 0 }], []] };

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow_wake1.json', JSON.stringify(payload));
console.log('built, nodeCount:', payload.nodes.length);
