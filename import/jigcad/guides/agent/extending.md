# Extending the agent

Four changes cover most needs. Each touches the scope or the view in one place and the documentation the model reads in another, because the Reference is part of the instructions.

## Add a scope function

1. Add it to the object `labScope(host)` returns in `app/host.js`. Return small plain data: numbers rounded, ids as strings, no runtime objects. `yaml()` will print whatever you return, and the model pays for every character.
2. Throw an `Error` with a message that says how to fix the call, as `files.edit` does: *edit: text occurs 3 times in skate/motors.js; include more context so it is unique*.
3. If it changes code, notes or params, guard it in Read-only mode: add its name to `READONLY` in `app/ui/agent.jsx` (or, for a method on `game`, to the pattern in the `guard` call).
4. Document it in `content/reference.md` under "The agent's eval scope". The Reference is appended to the instructions, so the model learns it on the next send; the person reads the same line in the Reference tab.

```js
// an example, not in the library: a small read-only helper inside labScope's api object in app/host.js
lastTrick: () => { const e = rt().events.list({ type: 'trick', last: 1 })[0]; return e ? { t: +e.t.toFixed(3), name: e.data.name, landed: e.data.landed, score: e.data.score } : null; },
```

## Add a lab: link action

1. Add a `case` to the `switch` in `Host.link` (`app/host.js`). Read parameters from `q`, act, call `this.focus({ view })` to bring the right view forward, and return `true`; on a bad target, `this.toast('no … ' + id, true)` and return `false`.
2. List it in the Reference's "lab: links" section, so the agent can write it, and in the book's appendix of links for readers.
3. Add a matching `case` to `test/linkcheck.js`, which `test/links.js` and the book check use; an action it does not know is reported as *unknown action*. The case returns `null` for a good link or a short reason for a bad one.

## Add a mode

1. Add an option to the Mode `Seg` in `AgentView`: `{ value, label, title }`, where `title` is the tooltip.
2. Branch on `S.settings.mode` where the step runs: in `execute` for something that happens before a step (as Ask waits for approval), or in `runEval` for a different scope (as Read-only swaps in throwing functions).
3. Add its words to the composer's meta line.
4. Add one sentence to the instructions telling the model what the mode means for it, as the line for Ask and Read-only does.

## Add a line to the context block

Add a `lines.push(…)` to `context(host)` in `app/ui/agent.jsx`. Keep it to one line of live state the model cannot cheaply get with `eval`, and leave it out when it does not apply, as the diagnostics and pinned-trace lines do. Every line is sent with every message.

## Change a limit

| limit | where |
|---|---|
| 25 s per step | the `setTimeout` in `runEval` |
| 9,000 characters per result | `if (out.length > 9000)` in `runEval` |
| 3,000 characters per stored result, 30 turns per thread | `persist()` |
| 100 and 160 characters per earlier step | `toTurns()` |
| 5 decimals, 60 items, 64 numbers, 80 keys, 5 levels | `yaml()` |
| 8 diagnostics, 5 tricks | `context()` |

## Keep one tool

The design rests on a single `eval`. A second page tool is possible (the `tools` array takes several, up to the limit the capability reports), but each one needs its own schema and description, and the model cannot combine them in one loop the way it combines scope functions in one step. Prefer a new scope function.
