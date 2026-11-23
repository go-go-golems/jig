// claude.ts — the agent's model connection in the standalone build.
//
// The original workbench ran as a claude.ai artifact and borrowed the page's `sample` capability: a hosted tool-use
// loop (`sample(turns, opts)` → { text, truncated }, errors carrying a `.code`). Here the same contract is
// implemented with the Anthropic TypeScript SDK called from the browser with the user's own API key: a streaming
// manual tool loop over `client.beta.messages.stream` (beta only for the server-side refusal fallback).
//
// The key is stored in this browser's localStorage and sent only to the Anthropic API (or the base URL the user
// sets, e.g. a local proxy that adds the key itself). `dangerouslyAllowBrowser` is required for that: this is a
// local, single-user tool, never deploy a build with a key in it.
import Anthropic from '@anthropic-ai/sdk';

export type Tier = 'quick' | 'default' | 'complex';
export type Effort = '' | 'low' | 'medium' | 'high';

export interface AgentConnection {
  apiKey: string;
  /** optional: a proxy that forwards to the Anthropic API (it may add the key; then apiKey can be any string) */
  baseURL: string;
  /** optional per-tier model overrides */
  models: Partial<Record<Tier, string>>;
}

/** the default model for each tier of the agent's Model switch */
export const TIER_MODELS: Record<Tier, string> = {
  quick: 'claude-haiku-5-5',
  default: 'claude-opus-5-5',
  complex: 'claude-opus-5-5',
};
/** the effort a tier runs at when Thinking is on Auto (Opus 5.5 and Haiku 5.5 default to medium) */
const TIER_EFFORT: Record<Tier, 'low' | 'medium' | 'high' | 'xhigh'> = { quick: 'low', default: 'medium', complex: 'xhigh' };
/** models that take the server-side refusal fallback (`fallbacks: "default"`) */
const FALLBACK_MODELS = /^claude-(opus-5|fable-5|sonnet-5-5)/;

export interface SampleTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: any, ctx: { signal?: AbortSignal }) => Promise<string>;
}
export interface SampleTurn { role: 'user' | 'assistant'; content: string }
export interface SampleOptions {
  signal?: AbortSignal;
  modelTier?: Tier;
  effort?: Effort;
  tools?: SampleTool[];
  onText?: (e: { text: string }) => void;
  /** images attached to the last user turn */
  images?: Blob[];
}
export interface SampleResult { text: string; truncated: boolean }
export interface SampleLimits { images: { maxCount: number; mediaTypes: string[] } }

/** errors in the shape the agent panel already handles: `code` picks the message it shows */
export class SampleError extends Error {
  code: string;
  text?: string;
  constructor(code: string, message: string, text?: string) { super(message); this.code = code; this.text = text; }
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
export const LIMITS: SampleLimits = { images: { maxCount: 4, mediaTypes: IMAGE_TYPES } };
const MAX_ROUNDS = 40;

async function blobToImage(b: Blob): Promise<Anthropic.Beta.BetaImageBlockParam> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  const media = (IMAGE_TYPES.includes(b.type) ? b.type : 'image/png') as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
  return { type: 'image', source: { type: 'base64', media_type: media, data: btoa(bin) } };
}

/** check a tool input against the (flat) JSON schema the tool declared: with eager input streaming the API no
 *  longer validates it, and a truncated input must not run */
function checkInput(tool: SampleTool, input: unknown): string | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'input must be an object';
  const schema = tool.inputSchema as { properties?: Record<string, { type?: string; enum?: unknown[] }>; required?: string[] };
  for (const k of schema.required || []) if (!(k in (input as object))) return `missing required field '${k}'`;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const p = schema.properties && schema.properties[k];
    if (!p) return `unknown field '${k}'`;
    if (p.type && typeof v !== p.type) return `field '${k}' must be a ${p.type}`;
    if (p.enum && !p.enum.includes(v)) return `field '${k}' must be one of ${p.enum.join(', ')}`;
  }
  return null;
}

export function createSampler(conn: AgentConnection, clientOptions: { fetch?: typeof fetch } = {}) {
  const client = new Anthropic({
    apiKey: conn.apiKey,
    baseURL: conn.baseURL || undefined,
    dangerouslyAllowBrowser: true,
    ...clientOptions,   // tests inject a fake fetch
  });

  async function sample(turns: SampleTurn[], o: SampleOptions = {}): Promise<SampleResult> {
    const tier = o.modelTier || 'default';
    const model = conn.models[tier] || TIER_MODELS[tier];
    const tools = o.tools || [];
    const messages: Anthropic.Beta.BetaMessageParam[] = turns.map(t => ({ role: t.role, content: t.content }));
    if (o.images && o.images.length && messages.length) {
      const last = messages[messages.length - 1];
      const imgs = await Promise.all(o.images.slice(0, LIMITS.images.maxCount).map(blobToImage));
      last.content = [...imgs, { type: 'text', text: String(last.content) }];
    }
    const toolDefs: Anthropic.Beta.BetaTool[] = tools.map(t => ({
      name: t.name, description: t.description, eager_input_streaming: true,
      input_schema: t.inputSchema as Anthropic.Beta.BetaTool['input_schema'],
    }));
    const fallback = FALLBACK_MODELS.test(model);
    let text = '';          // the text of every round, as the panel shows one answer per turn
    let jsonRetries = 0;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      if (o.signal && o.signal.aborted) throw new SampleError('cancelled', 'Stopped.');
      const before = text;
      const stream = client.beta.messages.stream({
        model,
        max_tokens: 64000,
        messages,
        tools: toolDefs.length ? toolDefs : undefined,
        output_config: { effort: o.effort || TIER_EFFORT[tier] },
        // the instructions and history are a stable prefix across the rounds of a turn
        cache_control: { type: 'ephemeral' },
        ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      }, { signal: o.signal });
      stream.on('text', delta => { text += delta; o.onText && o.onText({ text }); });
      let msg: Anthropic.Beta.BetaMessage;
      try {
        msg = await stream.finalMessage();
        jsonRetries = 0;
      } catch (e) {
        if (o.signal && o.signal.aborted) throw new SampleError('cancelled', 'Stopped.', text);
        if (e instanceof Anthropic.AuthenticationError) throw new SampleError('not_granted', 'The API key was rejected.');
        if (e instanceof Anthropic.PermissionDeniedError) throw new SampleError('not_granted', 'This API key may not use ' + model + '.');
        if (e instanceof Anthropic.RateLimitError) throw new SampleError('rate_limited', e.message, text);
        if (e instanceof Anthropic.BadRequestError && /prompt is too long|too many tokens|context/i.test(e.message)) throw new SampleError('prompt_too_large', e.message, text);
        if (e instanceof Anthropic.APIError) throw new SampleError('api_error', e.message, text);
        // a tool input that could not be parsed, or a dropped connection: re-issue the round a couple of times
        if (jsonRetries++ >= 2) throw new SampleError('api_error', (e as Error).message || String(e), text);
        text = before;
        continue;
      }
      if (msg.stop_reason === 'refusal') throw new SampleError('refused', 'Claude declined this request.', text);
      if (msg.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: msg.content }); continue; }
      const uses = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
      if (!uses.length) return { text, truncated: msg.stop_reason === 'max_tokens' };
      if (msg.stop_reason === 'max_tokens') return { text, truncated: true };   // never run a cut-off tool input
      messages.push({ role: 'assistant', content: msg.content });
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const u of uses) {
        const tool = tools.find(t => t.name === u.name);
        const bad = tool ? checkInput(tool, u.input) : `no tool named ${u.name}`;
        if (bad || !tool) { results.push({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: 'invalid input: ' + bad }); continue; }
        try { results.push({ type: 'tool_result', tool_use_id: u.id, content: await tool.execute(u.input, { signal: o.signal }) }); }
        catch (e) { results.push({ type: 'tool_result', tool_use_id: u.id, is_error: true, content: (e as Error).message || String(e) }); }
      }
      messages.push({ role: 'user', content: results });
      if (text && !text.endsWith('\n')) { text += '\n\n'; o.onText && o.onText({ text }); }
    }
    return { text: text + '\n\n(stopped after ' + MAX_ROUNDS + ' tool rounds)', truncated: true };
  }

  return Object.assign(sample, { limits: async (): Promise<SampleLimits> => LIMITS });
}
export type Sampler = ReturnType<typeof createSampler>;
