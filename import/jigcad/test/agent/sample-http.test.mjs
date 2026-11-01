// The jigcad serve adapter (src/host/sample-http.js) against a Node server speaking the /api/sample protocol:
// a tool round trip, errors before and during the stream, cancel on abort, and the models probe.
// node --test test/agent/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { httpSample, createHttpSample } from '../../src/host/sample-http.js';

// A scripted backend: `script(req, sse, ctx)` writes events; tool results arrive on ctx.tool(use) promises.
async function backend(script, { models = { available: true, tiers: { default: 'lunaroute/glm-5.3-flash' } } } = {}) {
  const waiting = new Map(), log = [];
  const toolPromise = use => new Promise(res => waiting.set(use, res));
  const srv = createServer(async (req, res) => {
    let body = '';
    for await (const c of req) body += c;
    log.push({ method: req.method, url: req.url, body: body ? JSON.parse(body) : null });
    if (req.url === '/api/sample/models') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify(models)); }
    let m;
    if ((m = /^\/api\/sample\/(\w+)\/tools\/(\w+)$/.exec(req.url))) {
      const r = waiting.get(m[2]); waiting.delete(m[2]);
      res.statusCode = r ? 200 : 404; res.end('{"ok":true}');
      if (r) r(JSON.parse(body));
      return;
    }
    if ((m = /^\/api\/sample\/(\w+)\/cancel$/.exec(req.url))) { res.end('{"ok":true}'); return; }
    if (req.url === '/api/sample') {
      const sse = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
      await script(JSON.parse(body), sse, { tool: toolPromise, res });
      return;
    }
    res.statusCode = 404; res.end();
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}/`;
  return { base, log, close: () => new Promise(r => { srv.closeAllConnections(); srv.close(r); }) };
}

const evalTool = calls => ({
  name: 'eval', description: 'run code', inputSchema: { type: 'object', properties: { code: { type: 'string' } } },
  async execute(input) { calls.push(input); return 'value: 2'; },
});

test('a tool round trip streams text and returns the result', async () => {
  const b = await backend(async (req, sse, ctx) => {
    ctx.res.writeHead(200, { 'content-type': 'text/event-stream' });
    sse('call', { call: 'jc1' });
    sse('thinking', { text: 'hmm', delta: 'hmm' });
    sse('text', { text: 'Checking.', delta: 'Checking.' });
    sse('tool', { use: 'u1', name: 'eval', input: { code: '1+1' } });
    const r = await ctx.tool('u1');
    sse('text', { text: 'Checking.\n\nIt is ' + r.value, delta: '…' });
    sse('result', { text: 'Checking.\n\nIt is ' + r.value, truncated: false, modelTierApplied: req.modelTier, modelUsed: 'lunaroute/deepseek-4.1-flash',
      usage: { input: 900, cacheRead: 400, cacheWrite: 0, output: 30, rounds: 2, toolCalls: 1 } });
    ctx.res.end();
  });
  try {
    const calls = [], texts = [];
    const sample = createHttpSample(b.base);
    const res = await sample([{ role: 'user', content: 'what is 1+1?' }], { tools: [evalTool(calls)], modelTier: 'complex', onText: u => texts.push(u.text) });
    assert.deepEqual(calls, [{ code: '1+1' }]);
    assert.equal(res.text, 'Checking.\n\nIt is value: 2');
    assert.equal(res.modelTierApplied, 'complex');
    assert.equal(res.modelApplied, 'lunaroute/deepseek-4.1-flash');
    assert.deepEqual(res.usage, { input: 900, cacheRead: 400, cacheWrite: 0, output: 30, rounds: 2, toolCalls: 1 });
    assert.deepEqual(texts, ['Thinking…', 'Checking.', 'Checking.\n\nIt is value: 2']);
    const post = b.log.find(x => x.url === '/api/sample');
    assert.equal(post.body.tools[0].name, 'eval');
    assert.equal(post.body.tools[0].inputSchema.type, 'object');
    assert.deepEqual(b.log.find(x => x.url.includes('/tools/')).body, { value: 'value: 2', isError: false });
  } finally { await b.close(); }
});

test('a throwing tool posts an error result', async () => {
  const b = await backend(async (req, sse, ctx) => {
    ctx.res.writeHead(200, { 'content-type': 'text/event-stream' });
    sse('call', { call: 'jc2' });
    sse('tool', { use: 'u1', name: 'eval', input: {} });
    const r = await ctx.tool('u1');
    sse('result', { text: JSON.stringify(r), truncated: false });
    ctx.res.end();
  });
  try {
    const tool = { name: 'eval', description: '', execute() { throw new Error('boom'); } };
    const res = await createHttpSample(b.base)('x', { tools: [tool] });
    assert.deepEqual(JSON.parse(res.text), { value: 'boom', isError: true });
  } finally { await b.close(); }
});

test('errors keep their contract codes', async () => {
  const b = await backend(async (req, sse, ctx) => {
    if (req.input === 'early') {
      ctx.res.writeHead(400, { 'content-type': 'application/json' });
      return ctx.res.end(JSON.stringify({ error: { code: 'prompt_too_large', message: 'too long' } }));
    }
    ctx.res.writeHead(200, { 'content-type': 'text/event-stream' });
    sse('call', { call: 'jc3' });
    sse('text', { text: 'partial', delta: 'partial' });
    sse('error', { code: 'authentication_error', message: 'log in', usage: { input: 5, output: 0, rounds: 1 } });
    ctx.res.end();
  });
  try {
    const sample = createHttpSample(b.base);
    await assert.rejects(sample('early'), e => e.code === 'prompt_too_large');
    await assert.rejects(sample('late'), e => e.code === 'authentication_error' && e.text === 'partial' && e.usage.rounds === 1);
    await assert.rejects(sample([{ role: 'assistant', content: 'x' }]), e => e.code === 'invalid_request');
  } finally { await b.close(); }
});

test('aborting cancels the call on the server', async () => {
  const ctl = new AbortController();
  const b = await backend(async (req, sse, ctx) => {
    ctx.res.writeHead(200, { 'content-type': 'text/event-stream' });
    sse('call', { call: 'jc4' });
    sse('text', { text: 'working', delta: 'working' });
    setTimeout(() => ctl.abort(), 30);
    await new Promise(r => ctx.res.on('close', r));
  });
  try {
    await assert.rejects(createHttpSample(b.base)('x', { signal: ctl.signal }), e => e.code === 'cancelled' && e.text === 'working');
    await new Promise(r => setTimeout(r, 50));
    assert.ok(b.log.some(x => x.url === '/api/sample/jc4/cancel'), 'cancel posted');
  } finally { await b.close(); }
});

test('the probe needs an available backend', async () => {
  const on = await backend(async () => {});
  const off = await backend(async () => {}, { models: { available: false } });
  try {
    const s = await httpSample(on.base);
    assert.equal(typeof s, 'function');
    assert.equal(s.info.tiers.default, 'lunaroute/glm-5.3-flash');
    assert.equal(await httpSample(off.base), null);
    assert.equal(await httpSample('http://127.0.0.1:9/'), null, 'nothing listening');
  } finally { await on.close(); await off.close(); }
});

test('JIG-006: request images and tool-result images reach the server', async () => {
  const JPEG = '/9j/4AAQ';
  let toolBody = null;
  const b = await backend(async (req, sse, ctx) => {
    ctx.res.writeHead(200, { 'content-type': 'text/event-stream' });
    sse('call', { call: 'jc9' });
    sse('tool', { use: 'u1', name: 'eval', input: { code: 'look()' } });
    toolBody = await ctx.tool('u1');
    sse('result', { text: `saw ${req.images.length}`, truncated: false, modelTierApplied: 'default' });
    ctx.res.end();
  });
  try {
    const looker = { name: 'eval', description: 'x', async execute() { return { [Symbol.for('jigcad.toolImages')]: [{ mimeType: 'image/jpeg', data: JPEG }], value: 'image 1: axo view' }; } };
    const sample = createHttpSample(b.base);
    const res = await sample('what is this?', { tools: [looker], images: [{ mimeType: 'image/jpeg', data: JPEG, url: 'data:…', width: 2 }] });
    assert.equal(res.text, 'saw 1');
    assert.deepEqual(b.log.find(x => x.url === '/api/sample').body.images, [{ mimeType: 'image/jpeg', data: JPEG }], 'only mimeType and data are sent');
    assert.deepEqual(toolBody, { value: 'image 1: axo view', isError: false, images: [{ mimeType: 'image/jpeg', data: JPEG }] });
    await assert.rejects(sample('x', { images: [{ mimeType: 'image/png', data: 'x' }] }), e => e.code === 'invalid_request');
    await assert.rejects(sample('x', { images: Array(5).fill({ mimeType: 'image/jpeg', data: JPEG }) }), e => e.code === 'invalid_request');
  } finally { await b.close(); }
});

test('onThinking receives the reasoning; no placeholder text then', async () => {
  const b = await backend(async (req, sse, ctx) => {
    ctx.res.writeHead(200, { 'content-type': 'text/event-stream' });
    sse('call', { call: 'jc2' });
    sse('thinking', { text: 'The wall', delta: 'The wall' });
    sse('thinking', { text: 'The wall is 2 mm.', delta: ' is 2 mm.' });
    sse('text', { text: 'It is 2 mm.', delta: 'It is 2 mm.' });
    sse('result', { text: 'It is 2 mm.', truncated: false, modelTierApplied: req.modelTier });
    ctx.res.end();
  });
  try {
    const texts = [], thoughts = [];
    const sample = createHttpSample(b.base);
    await sample([{ role: 'user', content: 'wall?' }], { onText: u => texts.push(u.text), onThinking: u => thoughts.push([u.text, u.delta]) });
    assert.deepEqual(thoughts, [['The wall', 'The wall'], ['The wall is 2 mm.', ' is 2 mm.']]);
    assert.deepEqual(texts, ['It is 2 mm.']);
  } finally { await b.close(); }
});
