// tests/agent-loop.test.ts — the agent's tool loop (src/app/claude.ts) against a scripted fake API: no network, no
// key. Round 1 streams text and an `eval` tool_use; round 2 checks the tool_result came back and ends the turn.
// Run: npx tsx tests/agent-loop.test.ts
import assert from 'node:assert/strict';
import { createSampler } from '../src/app/claude';

const sse = (events: [string, unknown][]) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join('');
const msg = (id: string) => ({ id, type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } });
const ROUNDS = [
  sse([
    ['message_start', { type: 'message_start', message: msg('m1') }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Let me look.' } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['content_block_start', { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'tu1', name: 'eval', input: {} } }],
    ['content_block_delta', { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"code": "return 1 + 1"}' } }],
    ['content_block_stop', { type: 'content_block_stop', index: 1 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 5 } }],
    ['message_stop', { type: 'message_stop' }],
  ]),
  sse([
    ['message_start', { type: 'message_start', message: msg('m2') }],
    ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }],
    ['content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'It is 2.' } }],
    ['content_block_stop', { type: 'content_block_stop', index: 0 }],
    ['message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 3 } }],
    ['message_stop', { type: 'message_stop' }],
  ]),
];
const requests: any[] = [];
const fakeFetch = (async (_url: unknown, init?: RequestInit) => {
  requests.push(JSON.parse(String(init!.body)));
  const body = ROUNDS[requests.length - 1];
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream', 'request-id': 'req_test' } });
}) as typeof fetch;

const sample = createSampler({ apiKey: 'sk-test', baseURL: 'http://fake.invalid', models: {} }, { fetch: fakeFetch });
const ran: string[] = [];
const texts: string[] = [];
const res = await sample([{ role: 'user', content: 'what is 1 + 1?' }], {
  modelTier: 'default',
  onText: ({ text }) => texts.push(text),
  tools: [{
    name: 'eval', description: 'run code',
    inputSchema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] },
    execute: async ({ code }) => { ran.push(code); return '2'; },
  }],
});

assert.deepEqual(ran, ['return 1 + 1'], 'the eval tool ran once with the streamed input');
assert.equal(requests.length, 2, 'two rounds');
assert.equal(requests[0].model, 'claude-opus-5-5');
assert.deepEqual(requests[0].output_config, { effort: 'medium' });
assert.equal(requests[0].fallbacks, 'default', 'server-side refusal fallback on Opus');
assert.equal(requests[0].tools[0].eager_input_streaming, true);
const last = requests[1].messages[requests[1].messages.length - 1];
assert.equal(last.role, 'user');
assert.deepEqual(last.content, [{ type: 'tool_result', tool_use_id: 'tu1', content: '2' }], 'the tool result went back');
assert.equal(requests[1].messages[1].role, 'assistant');
assert.match(res.text, /^Let me look\.\n\nIt is 2\.$/);
assert.equal(res.truncated, false);
assert.ok(texts.length >= 2, 'text streamed through onText');
console.log('agent loop: ok —', JSON.stringify(res));
