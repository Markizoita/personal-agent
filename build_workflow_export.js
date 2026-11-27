require('./env');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const BASE = 'https://bot.marizo.site/api/v1';
const KEY = process.env.N8N_API_KEY;
const MAIN_ID = 'lULFqqQFMNb8byt2';
const NAME = 'Workflow Export to Git';
const N8N_CRED = { id: 'CRSl7wHHi6fn2pAq', name: 'n8n self API' };
const GH_CRED = { id: '0sW14aYtN5hD3V5T', name: 'GitHub export' };
const REPO_PATH = 'workflow_exports/main-workflow.json';
const OWNER = 'Markizoita', REPO = 'personal-agent';

function api(method, url, body) {
  let data = '';
  if (body) {
    const tmp = path.join(os.tmpdir(), `n8n_body_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
    fs.writeFileSync(tmp, JSON.stringify(body), { mode: 0o600 });
    data = `-H "Content-Type: application/json" --data-binary @${tmp}`;
  }
  const json = JSON.parse(execSync(`curl -s -X ${method} "${BASE}${url}" -H "X-N8N-API-KEY: ${KEY}" ${data}`).toString());
  if (json.message && !json.id && !json.data) throw new Error(`${method} ${url}: ${json.message}`);
  return json;
}

// The repo is public: any secret hardcoded in a node (e.g. the Telegram token in sendMessage URLs) must be blanked before commit.
const ENCODE_CODE = String.raw`const rules = [
  [/\d{8,10}:AA[A-Za-z0-9_-]{30,}/g, '<TELEGRAM_BOT_TOKEN>'],
  [/sk-ant-[A-Za-z0-9_-]{20,}/g, '<ANTHROPIC_KEY>'],
  [/sb_secret_[A-Za-z0-9_-]{10,}/g, '<SUPABASE_SECRET>'],
  [/eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/g, '<JWT>'],
  [/(?:github_pat_|ghp_)[A-Za-z0-9_]{20,}/g, '<GITHUB_TOKEN>'],
  [/dop_v1_[a-f0-9]{40,}/g, '<DO_TOKEN>'],
  [/(postgres(?:ql)?:\/\/[^:\s"]+:)[^@\s"]+@/g, '$1<PASSWORD>@'],
];
let text = JSON.stringify($json, null, 2);
let redacted = 0;
for (const [re, rep] of rules) text = text.replace(re, (...m) => { redacted++; return rep.replace('$1', m[1]); });
const b64 = Buffer.from(text, 'utf8').toString('base64');
const now = new Date().toISOString().slice(0, 10);
return [{ json: { content: b64, message: 'Nightly workflow export ' + now + ' (' + redacted + ' secrets redacted)' } }];`;

module.exports = { ENCODE_CODE };
if (require.main !== module) return;

const main = api('GET', `/workflows/${MAIN_ID}`);

const wf = {
  name: NAME,
  nodes: [
    { id: 'we01', name: 'Nightly 3am', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: [0, 0],
      parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 3 * * *' }] } } },
    { id: 'we02', name: 'Fetch Workflow', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [220, 0],
      parameters: { method: 'GET', url: `https://bot.marizo.site/api/v1/workflows/${MAIN_ID}`,
        authentication: 'predefinedCredentialType', nodeCredentialType: 'httpHeaderAuth', options: {} },
      credentials: { httpHeaderAuth: N8N_CRED } },
    { id: 'we03', name: 'Encode Export', type: 'n8n-nodes-base.code', typeVersion: 2, position: [440, 0],
      parameters: { jsCode: ENCODE_CODE } },
    { id: 'we04', name: 'Get Existing SHA', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [660, 0],
      continueOnFail: true,
      parameters: { method: 'GET', url: `https://api.github.com/repos/${OWNER}/${REPO}/contents/${REPO_PATH}`,
        authentication: 'predefinedCredentialType', nodeCredentialType: 'githubApi',
        sendHeaders: true, headerParameters: { parameters: [{ name: 'Accept', value: 'application/vnd.github+json' }] }, options: {} },
      credentials: { githubApi: GH_CRED } },
    { id: 'we05', name: 'Build Commit Body', type: 'n8n-nodes-base.code', typeVersion: 2, position: [880, 0],
      parameters: { jsCode:
        "const enc = $('Encode Export').first().json;\n" +
        "const sha = $json && $json.sha ? $json.sha : undefined;\n" +
        "const body = { message: enc.message, content: enc.content };\n" +
        "if (sha) body.sha = sha;\n" +
        "return [{ json: body }];"
      } },
    { id: 'we06', name: 'Commit File', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1100, 0],
      retryOnFail: true, maxTries: 2, waitBetweenTries: 1500,
      parameters: { method: 'PUT', url: `https://api.github.com/repos/${OWNER}/${REPO}/contents/${REPO_PATH}`,
        authentication: 'predefinedCredentialType', nodeCredentialType: 'githubApi',
        sendHeaders: true, headerParameters: { parameters: [{ name: 'Accept', value: 'application/vnd.github+json' }] },
        sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json) }}', options: {} },
      credentials: { githubApi: GH_CRED } }
  ],
  connections: {
    'Nightly 3am': { main: [[{ node: 'Fetch Workflow', type: 'main', index: 0 }]] },
    'Fetch Workflow': { main: [[{ node: 'Encode Export', type: 'main', index: 0 }]] },
    'Encode Export': { main: [[{ node: 'Get Existing SHA', type: 'main', index: 0 }]] },
    'Get Existing SHA': { main: [[{ node: 'Build Commit Body', type: 'main', index: 0 }]] },
    'Build Commit Body': { main: [[{ node: 'Commit File', type: 'main', index: 0 }]] }
  },
  settings: { executionOrder: 'v1', errorWorkflow: main.settings.errorWorkflow }
};

const existing = api('GET', '/workflows?limit=250').data.find(w => w.name === NAME);
if (existing && existing.active) api('POST', `/workflows/${existing.id}/deactivate`);
const saved = existing ? api('PUT', `/workflows/${existing.id}`, wf) : api('POST', '/workflows', wf);
const act = api('POST', `/workflows/${saved.id}/activate`);
console.log(`${existing ? 'Updated' : 'Created'} ${NAME}: ${saved.id} | active: ${act.active}`);
