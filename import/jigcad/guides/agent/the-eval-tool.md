# The eval tool

`eval` is the agent's only tool. Claude sends JavaScript; the page runs it with the lab scope and sends back YAML. The model decides what code to send; the page decides what that code can reach.

## The schema

```js
// app/ui/agent.jsx:135–138
const evalTool = {
  name: 'eval',
  description: 'Run an async JavaScript function body in the workbench with the lab API in scope (files, run, test, trace, events, inspect, params, setParam, …). Returns the value as YAML plus console.log output. Use `return` to return a value.',
  inputSchema: { type: 'object', properties: { code: { type: 'string', description: 'the body of an async function; return what you want to see' } }, required: ['code'] },
  execute: async ({ code }, c) => { … },
};
```

`execute` coerces `code` to a string, records the step, waits for approval in Ask mode, runs `runEval`, stores the result on the step and returns the result text to Claude.

## How the code runs

```js
// app/ui/agent.jsx:59–68
const names = Object.keys(scope).filter(k => /^[A-Za-z_$][\w$]*$/.test(k));
const t0 = performance.now(); let value, error = null;
try {
  const fn = new Function(...names, '"use strict";\nreturn (async () => {\n' + code + '\n})();\n//# sourceURL=agent-eval.js');
  value = await Promise.race([fn(...names.map(k => scope[k])), new Promise((_, rej) => setTimeout(() => rej(new Error('eval timed out after 25 s')), 25000))]);
} catch (e) { error = e; }
```

- Every scope name becomes a parameter of a strict function whose body is an async arrow around the step's code. So the code can `await`, must `return` what it wants seen, and its `const` and `let` names do not carry over to the next step. Each step gets a new scope object.
- The race abandons the wait after 25 s with *eval timed out after 25 s*. It only catches code that awaits: a synchronous loop that never ends blocks the page, because the timer cannot fire.
- An error comes back as `Error: <message> (line N)`, with N taken from the `agent-eval.js` frame of the stack. In the current build N is two higher than the line in the step's code: a throw from the first line reports `(line 3)`.
- Anything passed to `console.log` or `log` is collected; strings as they are, other values as one-line YAML. `console.warn` and `console.error` add `warn: ` and `error: ` lines.
- With logs, the result is `logs:`, the lines, `---`, then the value.
- A result over 9,000 characters is cut, and the model reads `… cut (N chars). Return less: pick fields, slice arrays.`

A real result with logs, from `const e = test('heelflip').events; console.log(e.length, 'events'); return e.filter(x => x.type === 'catch');`:

```yaml
logs:
6 events
---
- t: 2.95
  type: catch
  by: flick
  after: 0.317
```

A real error, from an edit whose text was not in the file:

```text
Error: edit: text not found in skate/motors.js (it must match exactly, including spaces) (line 3)
```

## The scope

`labScope(host)` in `app/host.js` builds the API; `runEval` adds `lab` (the same scope as one object), `console` and `log`, and deletes `host` (the whole workbench) from both. The names, by what they act on:

| group | name | returns |
|---|---|---|
| files | `files.list()` | `[{ path, lines, edited }]`, sorted |
| | `files.read(path, from?, to?)` | the whole file; with `from`, numbered lines `from`…`to` (40 lines by default) |
| | `files.grep(pattern, path?)` | up to 80 lines `file:line  text` (text trimmed to 160 characters) |
| | `files.edit(path, find, replace)` | `{ path, line }`; throws when `find` is missing or occurs more than once |
| | `files.write(path, src)` | `{ path, lines }` |
| the live world | `game`, `world` | the stage's runtime and its world |
| | `read(id)`, `trace(id)` | a state's or signal's value now; its trace, read with `.last(s).values()`, `.summary()` or `.plot()` |
| | `events(type?, last = 20)` | `[{ t, type, source, …data }]`, numbers to 3 decimals |
| | `params(glob = '**')` | `[{ id, value, default, min, max, unit, label }]` |
| | `setParam(id, v)` | the new value |
| | `run()` | `{ ok: true, ms, kept, warnings }` or `{ ok: false, errors: [{ message, at }] }` |
| | `reset()`, `pause()`, `play()` | `'reset'`, `'paused'`, `'playing'` |
| | `step(n = 1)`, `advance(seconds = 1)`, `perform(trick)` | the time; `{ time, failed }`; `true` once the gesture is scheduled, `false` when there is no such gesture |
| fresh worlds | `test(o)` | `{ ok, time, ms, failed, tricks, events }` from a new headless runtime; `test('kickflip')` means `test({ trick: 'kickflip' })` |
| | `simulate(o)` | that runtime itself |
| the program | `describe(id)`, `inspect(glob)`, `query(fn)`, `diagnostics()` | the compiled program's nodes; `[{ severity, message, at }]` |
| the bench | `open(file, line)`, `select(id)`, `view(name, track?)`, `overlay(name, on = true)`, `pin(id)`, `link(href)` | they drive the workbench's views |
| | `notes()`, `setNotes(md)`, `doc(id)` | the preset's notes; their new length; a shelf doc's Markdown |
| | `book.contents()`, `book.chapter(n)`, `book.search(text)`, `book.open(n, at?)` | `[{ n, part, title, about, written }]`; a chapter's Markdown; `[{ n, title, hits }]`; opens it for the person |
| | `experiment(name, { full })` | the experiment's rows, also shown in Experiments |
| | `depthOrder.list()`, `depthOrder.use(name)` | the stage's drawing-order strategies |
| | `clip.info()`, `clip.record(seconds, trick?)`, `clip.useRecording()`, `clip.replay()`, `clip.stop()`, `clip.score(o)`, `clip.cameras` | recording, replaying and scoring clips |
| helpers | `FORM`, `V`, `Q`, `console`, `log`, `lab` | the core, vector and quaternion maths, logging, the scope itself |

`test` builds its world from the files as they are now, including edits not yet run, at the declared default params. It plays the trick's routine for at least 3.6 s and keeps eleven event types (`trick`, `bail`, `land`, `pop`, `flick`, `scoop`, `wrap`, `catch`, `tailStrike`, `respawn`, `error`). Live params never reach it.

## The result format: yaml()

`yaml()` (agent.jsx:16–41) writes compact YAML for the model, never JSON:

| value | written as |
|---|---|
| number | rounded to 5 decimals (`0.98765`); `NaN` and `Infinity` as words |
| string | bare when short and plain (letters, digits, spaces and `.,:/()+-·×→%`, under 120 characters), quoted JSON otherwise, a `|` block when it has newlines |
| function | `[function name]` |
| a handle with `kind` and `id` | `kind id`, e.g. `system pop/pop` |
| the runtime | `[Runtime t=3.542 failed=false]` |
| world, host | `[World]`, `[Host]` |
| list of numbers | one line, up to 64 items, then `… N items` |
| other lists | `- ` items, up to 60, then `# … N more` |
| objects | `key: value` lines, up to 80 keys, then `# … N more keys` |
| deeper than 5 levels | `[array N]` or `{…}` |
| Map, Set, typed array | as an object, a list, a list |
| a repeated object | `[circular]` |

A real result, from `return params('flick/*');` (first entry of eight):

```yaml
- id: flick/spin
  value: 19
  default: 19
  min: 0
  max: 45
  unit: rad/s
  label: flip rate per turn
```

## The Read-only guard

```js
// app/ui/agent.jsx:42, 50–57
const READONLY = new Set(['run', 'reset', 'setParam', 'setNotes']);
if (readOnly) {
  for (const k of READONLY) scope[k] = () => { throw new Error(`read-only mode: ${k}() is off`); };
  const off = k => () => { throw new Error(`read-only mode: ${String(k)}() is off`); };
  const guard = (obj, test) => obj && new Proxy(obj, { get: (t, k) => test(String(k)) ? off(k) : k === 'paramValues' ? new Map(t[k]) : (typeof t[k] === 'function' ? t[k].bind(t) : t[k]) });
  scope.game = guard(host.rt, k => /^(setParam|edit|reset|set|add)$/.test(k));
  scope.lab = Object.assign({}, scope);
}
```

`files.write` and `files.edit` are replaced too (agent.jsx:46). Real results in Read-only mode:

```text
Error: read-only mode: files.edit is off (line 3)
Error: read-only mode: files.write is off (line 3)     ← lab.files.write
Error: read-only mode: setParam() is off (line 3)      ← game.setParam
```

The guard protects code, notes and params from an accidental edit. It is not a sandbox: `perform`, `step`, `advance` and `world.applyImpulse` still drive the live world.
