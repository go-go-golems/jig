# Artifact runtime capabilities (the page jigcad is published as)

The page runs as a claude.ai artifact under a content security policy: scripts and fonts only from the artifact's own files (we ship everything), `fetch` only to the artifact's own files (`./occt/replicad_single.wasm.gz` works), Web Workers from the page's own files are allowed, no `alert/confirm/prompt`, no `<a download>`, `localStorage` may throw (wrap in try/catch). Only a plain `#name` passes in the URL hash.

Capabilities live behind `claude.use(name)`, which resolves to a frozen namespace or `null` (not granted / not served / failed: indistinguishable). Never read `window.claude.x` directly; render without the capability and light features up when the promise resolves (never within the first script run; `null` after 10 s when no viewer answers). Permission prompts arrive on the first *call*, not on `use()`.

## sample (the agent's model)

`const sample = await claude.use("sample")` (null → show the agent's off banner, disable Send).
`await sample(input, opts?)` → `{ text, truncated }`. `input`: a string, or `[{ role: "user" | "assistant", content: string }]` ending on a user turn. Memoryless: send instructions + data every time.
opts:
- `onText({ text, delta })`: streaming; `text` is the WHOLE answer so far (assign it, don't append).
- `signal`: an AbortController signal (one per call) for Stop.
- `tools: [{ name, description, inputSchema?, execute(input) }]`: page functions the model may call; return small data or throw. This is how the `eval` tool is wired.
- `modelTier: 'quick' | 'default' | 'complex'` (map the panel's Model control: Fast → quick, Balanced → default, Deep → complex).
- `cache: false` for chat.
- Only if the user names a model/effort: `{ model, modelTier, effort: 'low' | 'medium' | 'high' }` (map Thinking: Low/Med/High → effort; Auto → omit).
Rejections are `{ code, message, text? }`: hide the feature on `not_granted`, back off on `rate_limited`, never loop. The first call asks the viewer's consent, so call on a click.

## downloads (exports)

`const downloads = await claude.use("downloads")` (null → hide Export, or fall back to a Copy button for text formats).
`await downloads.save({ filename, data })` (`data`: Blob, ArrayBuffer or string). The viewer confirms and may decline: handle rejection with a toast.

## Storage

Use `localStorage` (wrapped in try/catch) for per-browser conveniences: layout, theme, open preset, edited files, agent threads. Nothing must depend on it working.
