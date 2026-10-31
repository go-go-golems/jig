# How the agent works

The agent is one React view, `AgentView` in `app/ui/agent.jsx`, shown in the workbench's **Agent** tab. It keeps its threads in a module-level object, asks the page's `sample` capability for Claude, and gives Claude one page function, `eval`. Everything below is what that file does.

## The parts

| part | where | what it does |
|---|---|---|
| `S` | agent.jsx:9 | `{ threads, active, settings }`, read from browser storage at load; settings default to `{ mode: 'auto', tier: 'default', effort: '' }` |
| `persist()` | agent.jsx:11 | writes threads (trimmed), the active thread and the settings back to storage |
| `getSample()` | agent.jsx:13 | calls `window.claude.use('sample')` once and remembers the promise; `null` when the capability is missing or throws |
| `yaml()` | agent.jsx:16 | turns any value into the YAML text the model reads |
| `runEval()` | agent.jsx:43 | builds the scope, runs one step's code, formats the result |
| `instructions()` | agent.jsx:73 | the instructions, ending with the whole Reference |
| `context()` | agent.jsx:88 | the `[context]` block of live state |
| `toTurns()` | agent.jsx:101 | the thread as the turn list `sample()` takes |
| `AgentView` | agent.jsx:118 | the panel: threads, settings, log, composer; `send`, `revert`, `newThread`, `closeThread` |

## One turn

`send(text)` (agent.jsx:127) runs a whole turn:

1. It ignores empty text and does nothing while a turn is running.
2. It awaits `getSample()`. With no capability it sets the off message *Claude is not available here, so the agent is off. Everything else in the workbench works.* and stops.
3. It appends the user turn and, if the thread is still called *New thread*, titles it with the first 32 characters of the text.
4. It appends an agent turn `{ role: 'agent', text: '', steps: [], pending: true }`, clears the composer, marks the panel busy and saves.
5. It makes a fresh `AbortController`; **Stop** calls `abort()` on it.
6. It defines the `eval` tool (see the eval tool section) and calls `sample`:

```js
// app/ui/agent.jsx:157–161
const turns = toTurns(host, th);
const opts = { signal: ctl.current.signal, modelTier: S.settings.tier, tools: [evalTool], onText: ({ text }) => { turn.text = text; re(); } };
if (S.settings.effort) opts.effort = S.settings.effort;
const res = await sample(turns, opts);
turn.text = res.text; if (res.truncated) turn.note = 'The answer hit the length limit.';
```

7. `onText` assigns the whole answer so far to the turn on every call, so the answer streams into the log.
8. A rejection becomes a one-line note on the turn (modes and permissions lists each one). Any text that had already streamed is kept, except after `refused`, where it is cleared.
9. The turn stops pending, the panel stops being busy, and the thread is saved.

## The loop belongs to the capability

The view has no loop of its own and no step counter. One `sample()` call carries the whole turn: Claude calls `eval`, the page runs `execute`, the result goes back, and Claude calls `eval` again or writes its answer. The `sample` capability makes these rounds and, per its contract, allows a handful of them and makes the last one an answer. Each round re-reads everything so far, which is one more reason to keep results small. Stop rejects the call with `cancelled`, aborts a running `execute` through its `context.signal`, and makes no further round; what the steps already did stays done.

## What the model receives

`toTurns` (agent.jsx:101–114) rebuilds the conversation every turn:

- A user turn is sent as its text.
- An agent turn is sent as one line per step, then its answer (or `(no answer)`):
  `[eval] <first line of code, up to 100 characters> → <result with whitespace collapsed, up to 160 characters>`, with `, later reverted` after `eval` when the person reverted that step.
- Trailing agent turns are dropped, so the list ends on a user turn.
- The first user turn is prefixed with the instructions and a `---` line; the last user turn is prefixed with the context block. Two turns of the same role in a row are merged.

On the first message of a thread both prefixes land on the same turn, so it reads: context block, instructions, Reference, `---`, the person's words. In B-01 that first turn is 17,619 characters. Its context block, captured from a real run:

```text
[context]
preset: B-01 Flatground (Basics) — The whole game, as the library ships it: a lot, a funbox, a board, a rider, fifteen tricks.
world: t = 3.86 s, running at 1×, driver autopilot
build: ok (16 systems, 15 signals, 42 states)
files: depth-order.js, experiments.js, main.js, rigid.js, skate/assist.js, skate/board.js, skate/controls.js, skate/figure.js, skate/index.js, skate/motors.js, skate/recognizer.js, skate/rider.js, skate/terrain.js (* edited)
pinned traces: recognizer/height, recognizer/flipTurns, recognizer/shoveTurns, recognizer/wrapTurns
[/context]
```

When they apply, the block also lists up to eight warnings and errors with `file:line`, the system that stopped the runtime, the node selected in the Graph, and the last five tricks with their flip, shove and air. A failed build reads `build: FAILS — <message>`.

So the model's memory is uneven: earlier answers come back whole, earlier step results only as a 160-character fragment. A measurement the agent did not write into its answer has to be measured again.

## A step

`execute` (agent.jsx:139–154) creates one step record per call:

```js
const step = { code, result: null, running: true, ms: 0, snapshot: { files: Object.assign({}, host.files) } };
```

| field | meaning |
|---|---|
| `code` | the code Claude sent |
| `running` | true until the code returns or is declined |
| `asking`, `resolve` | set in Ask mode while the step waits for the person |
| `result` | the YAML text the model received (or *The person declined this step.*) |
| `error` | the code threw, timed out, or was declined |
| `ms` | how long `runEval` took |
| `snapshot.files` | a copy of every file before the step |
| `changed` | any file differs from the snapshot, or one was deleted |
| `reverted` | the person reverted this step or an earlier one in the turn |

The panel re-renders on every change, so a step appears with a blinking dot as soon as Claude calls it and fills in when it returns.

## Revert

```js
// app/ui/agent.jsx:174–179
const revert = (turn, i) => {
  const s = turn.steps[i]; if (!s.snapshot) { host.toast('This step’s snapshot is gone (reloaded page)', true); return; }
  host.files = Object.assign({}, s.snapshot.files); host.saveEdits();
  for (let j = i; j < turn.steps.length; j++) turn.steps[j].reverted = true;
  host.build({}); host.toast('Reverted the files to before that step and rebuilt'); re(); persist();
};
```

Revert restores files only. A param changed with `setParam` stays changed, and the live world keeps whatever the steps did to it. The link shows only on a step that changed files and still has its snapshot.

## Threads and storage

- Threads sit in a bar above the settings; **+ New** adds `{ id: 'a' + Date.now().toString(36), title: 'New thread', turns: [] }` and is disabled while a turn runs. Closing the last thread leaves a fresh *New thread*.
- `persist()` keeps the last 30 turns of each thread, drops each step's `snapshot` and `resolve`, and trims results over 3,000 characters with `\n…`. So after a reload the revert links are gone.
- Storage is the browser's `localStorage` under the prefix `formskate.v1.`: `threads`, `thread` (the active id) and `agentSettings`. Every read and write is wrapped in `try`, so the panel works without storage, for that page load only.

## Where the person meets it

- The Agent tab is in every layout, always in the same tile as Code.
- A `lab:ask?q=…` link anywhere in the workbench brings the tab forward with the question in the composer. It never sends it.
- A new thread shows the empty state: one paragraph and up to six requests (the preset's own suggestions, then *Explain what happens in one step of this program, phase by phase* and *Make the kickflip spin faster and check it still lands*). Clicking one sends it.
- The log scrolls to the bottom on every render.
- The answer is rendered by the workbench's Markdown renderer (`render(text, { highlight, toc: false })`), the same one that renders notes, docs and the book. A click on a `lab:` link calls `host.link(href)`.
