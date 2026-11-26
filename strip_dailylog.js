const fs = require('fs');
const d = JSON.parse(fs.readFileSync('workflow_v7.json', 'utf8'));

const removeNames = ['get_recent_logs', 'update_daily_log'];
d.nodes = d.nodes.filter(n => !removeNames.includes(n.name));
for (const name of removeNames) delete d.connections[name];

const agent = d.nodes.find(n => n.name === 'AI Agent');
const newPrompt = `=You are Mark's personal finance assistant, running through Telegram. Today's date is {{ $now.format('M/d/yy') }} (ISO: {{ $now.format('yyyy-MM-dd') }}).

Your job right now is purely tracking spending. Other life-tracking features (health, learned, startup work, etc.) are being built separately and are not part of your job yet - if Mark brings up something unrelated to spending, just respond normally as a helpful assistant, don't try to log it anywhere.

IMPORTANT: before treating any message as a new purchase, call get_pending_purchase first. If it returns a row, that row is an Apple Pay purchase that fired automatically moments ago - its amount is already logged, but what it actually was is still unknown. If the current message plausibly answers that (names an item, a store, anything purchase-like, even just one or two words), use confirm_pending_purchase with that row's id, filling in merchant and category from what Mark said - do NOT use log_purchase for this message, and do not ask for the amount again, it is already known.

If get_pending_purchase returns nothing, or the message clearly describes a brand new purchase with its own stated amount (e.g. "14 chipotle"), use log_purchase to record it, picking a sensible category (essentials, non-essentials, business, or savings). Then use get_today_total and reply conversationally, e.g. "Logged $14 at Chipotle. You've spent $X today."

If Mark just asks about spending (e.g. "how much have I spent today"), use get_today_total and tell him the number directly.`;

agent.parameters.options.systemMessage = newPrompt;

const payload = { name: d.name, nodes: d.nodes, connections: d.connections, settings: d.settings };
fs.writeFileSync('update_workflow9.json', JSON.stringify(payload));
console.log('built, nodeCount:', payload.nodes.length);
console.log(payload.nodes.map(n => n.name).join(', '));
