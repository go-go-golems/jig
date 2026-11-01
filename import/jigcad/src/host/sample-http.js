// The `sample` capability over jigcad serve's HTTP backend (Go, pkg/server): one call is one streamed
// POST api/sample; the model's tool calls arrive as `tool` events, run here, and their results go back to
// api/sample/{call}/tools/{use}; aborting cancels on the server. Same contract as window.claude's sample:
//   sample(turns, { tools, signal, modelTier, model, effort, onText, onThinking }) → { text, truncated, modelTierApplied, modelApplied?, usage? }
// rejecting with an Error whose .code is one of the contract codes (and .usage when the server sent it). usage is
// { input, cacheRead, cacheWrite, output, rounds, toolCalls, model }: jigcad serve's addition, read by tools/agent-eval.
// Ported from slop-computer web/runtime/src/sample.ts without consent and caching. Images (JIG-006): o.images go with
// the request; a tool result may carry images (TOOL_IMAGES), which the server sends after the round's tool results.

export const MAX_PROMPT_BYTES = 256 << 10;
export const MAX_TOOL_RESULT_BYTES = 32 << 10;
export const MAX_IMAGES = 4;                 // per call, from the person
export const MAX_TOOL_IMAGES = 2;            // per tool result
// a tool's execute() may return { [TOOL_IMAGES]: images, value } (src/agent/evaltool.js withImages)
const TOOL_IMAGES = Symbol.for('jigcad.toolImages');

function checkImages(images, n) {
  if (!Array.isArray(images) || images.length > n) throw fail('invalid_request', `at most ${n} images`);
  for (const im of images) if (!im || im.mimeType !== 'image/jpeg' || typeof im.data !== 'string' || !im.data) throw fail('invalid_request', 'an image is { mimeType: "image/jpeg", data: base64 }');
  return images.map(im => ({ mimeType: im.mimeType, data: im.data }));
}

const CODES = new Set(['cancelled', 'prompt_too_large', 'empty_completion', 'rate_limited', 'invalid_request',
  'sampling_disabled', 'authentication_error', 'unauthorized', 'tools_unavailable', 'upstream_error']);

const bytes = s => new TextEncoder().encode(s).length;
function fail(code, message, extra) {
  return Object.assign(new Error(message), { code: CODES.has(code) ? code : 'upstream_error' }, extra || {});
}

function checkInput(input) {
  if (typeof input === 'string') {
    if (!input.trim()) throw fail('invalid_request', 'the prompt is empty');
    if (bytes(input) > MAX_PROMPT_BYTES) throw fail('prompt_too_large', `a prompt is at most ${MAX_PROMPT_BYTES} bytes`);
    return input;
  }
  if (!Array.isArray(input) || !input.length) throw fail('invalid_request', 'input is a string or a list of turns');
  let n = 0;
  for (const t of input) {
    if (!t || (t.role !== 'user' && t.role !== 'assistant') || typeof t.content !== 'string') throw fail('invalid_request', 'a turn is {role: user|assistant, content: string}');
    n += bytes(t.content);
  }
  if (input[0].role !== 'user' || input[input.length - 1].role !== 'user') throw fail('invalid_request', 'turns begin and end with a user turn');
  if (n > MAX_PROMPT_BYTES) throw fail('prompt_too_large', `a prompt is at most ${MAX_PROMPT_BYTES} bytes`);
  return input.map(t => ({ role: t.role, content: t.content }));
}

/** Split an SSE byte stream into { type, data } events. */
export async function* sseEvents(body) {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const x = await reader.read();
    if (x.done) return;
    buf += dec.decode(x.value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i);
      buf = buf.slice(i + 2);
      let type = '', data = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event: ')) type = line.slice(7);
        else if (line.startsWith('data: ')) data += line.slice(6);
      }
      if (data) yield { type, data: JSON.parse(data) };
    }
  }
}

/**
 * Build the sample function for the backend at `base` (a URL prefix ending in '/', default: this page's
 * directory). `fetchImpl` is for tests.
 */
export function createHttpSample(base = '', fetchImpl = (...a) => fetch(...a)) {
  const url = p => base + p;

  async function runTool(callId, tools, ev, signal) {
    const t = tools.find(x => x.name === ev.name);
    let value, isError = false, images;
    try {
      if (!t) throw new Error('no tool ' + ev.name);
      value = await t.execute(ev.input ?? {}, { signal });
      if (value && value[TOOL_IMAGES]) { images = checkImages(value[TOOL_IMAGES], MAX_TOOL_IMAGES); value = value.value; }
      if (value === undefined) value = null;
      const s = JSON.stringify(value) ?? 'null';
      if (bytes(s) > MAX_TOOL_RESULT_BYTES) { value = 'The tool result exceeded 32 KB and was dropped.'; isError = true; }
    } catch (e) {
      value = String((e && e.message) ?? e);
      isError = true;
    }
    if (signal.aborted) return;
    await fetchImpl(url(`api/sample/${callId}/tools/${encodeURIComponent(ev.use)}`), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(images && !isError ? { value, isError, images } : { value, isError }),
    }).catch(() => {});
  }

  return async function sample(input, o = {}) {
    const prompt = checkInput(input);
    const tools = o.tools ?? [];
    if (tools.length > 16) throw fail('tools_unavailable', 'at most 16 tools');
    for (const t of tools) if (!t || typeof t.name !== 'string' || typeof t.execute !== 'function') throw fail('invalid_request', 'a tool is {name, description, execute}');
    if (o.signal && o.signal.aborted) throw fail('cancelled', 'the call was aborted');
    const tier = o.modelTier && o.modelTier !== 'inherit' ? o.modelTier : 'default';
    const body = {
      input: prompt, modelTier: tier, model: o.model, effort: o.effort,
      tools: tools.map(t => ({ name: t.name, description: String(t.description ?? ''), inputSchema: t.inputSchema })),
    };
    if (o.images && o.images.length) body.images = checkImages(o.images, MAX_IMAGES);
    const ctrl = new AbortController();
    let callId = '', text = '', thinking = false;
    const onAbort = () => {
      if (callId) fetchImpl(url(`api/sample/${callId}/cancel`), { method: 'POST' }).catch(() => {});
      ctrl.abort();
    };
    if (o.signal) o.signal.addEventListener('abort', onAbort, { once: true });
    try {
      const r = await fetchImpl(url('api/sample'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal,
      });
      if (!r.ok || !r.body) {
        const e = await r.json().catch(() => null);
        throw fail(e?.error?.code ?? 'upstream_error', e?.error?.message ?? 'HTTP ' + r.status);
      }
      for await (const { type, data: ev } of sseEvents(r.body)) {
        switch (type) {
          case 'call': callId = ev.call; break;
          case 'thinking':
            // the model's reasoning, cumulative over the call (rounds joined by a blank line); a caller without
            // onThinking gets one 'Thinking…' placeholder as text, as before
            if (o.onThinking) o.onThinking({ text: ev.text, delta: ev.delta });
            else if (!text && !thinking && o.onText) { thinking = true; o.onText({ text: 'Thinking…', delta: '' }); }
            break;
          case 'text':
            text = ev.text;
            if (o.onText) o.onText({ text: ev.text, delta: ev.delta });
            break;
          case 'tool': runTool(callId, tools, ev, ctrl.signal); break;
          case 'result':
            return Object.freeze({ text: ev.text, truncated: !!ev.truncated, modelTierApplied: ev.modelTierApplied ?? tier,
              ...(ev.modelUsed || ev.modelApplied ? { modelApplied: ev.modelUsed || ev.modelApplied } : {}),
              ...(ev.usage ? { usage: ev.usage } : {}) });
          case 'error':
            throw fail(ev.code, ev.message ?? 'the model call failed', {
              ...(ev.text || text ? { text: ev.text || text } : {}), ...(ev.usage ? { usage: ev.usage } : {}) });
        }
      }
      if (o.signal && o.signal.aborted) throw fail('cancelled', 'the call was aborted', text ? { text } : undefined);
      throw fail('upstream_error', 'the call ended without a result', text ? { text } : undefined);
    } catch (e) {
      if ((o.signal && o.signal.aborted) || (e && e.name === 'AbortError')) throw fail('cancelled', 'the call was aborted', text ? { text } : undefined);
      throw e;
    } finally {
      if (o.signal) o.signal.removeEventListener('abort', onAbort);
    }
  };
}

/**
 * Probe the backend: GET api/sample/models. Resolves to the sample function (with .info, the models answer) when
 * a model backend answers, else null
 * (a static host, claude.ai, or `jigcad serve --no-models`).
 */
export async function httpSample(base = '', fetchImpl = (...a) => fetch(...a)) {
  try {
    const r = await fetchImpl(base + 'api/sample/models', { headers: { Accept: 'application/json' } });
    if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) return null;
    const info = await r.json();
    if (!info || !info.available) return null;
    const sample = createHttpSample(base, fetchImpl);
    sample.info = info;
    return sample;
  } catch { return null; }
}
