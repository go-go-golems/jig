# The system prompt

The `sample` capability has no system prompt the page controls: Claude sees only the turns the page sends. So the agent's instructions travel inside the first user turn of every call, followed by the workbench's whole Reference (`content/reference.md`, about 15,000 characters), a `---` line and the person's first message. The latest user turn is prefixed with the context block. Both are rebuilt on every send, so a thread picks up a changed Reference or a new preset at once.

## The instructions, verbatim

From `instructions(host)` in `app/ui/agent.jsx:73–87`; the last line, `${host.reference}`, is replaced by the Reference.

```text
You are the coding agent inside Form Skate Workbench, an IDE for building a skateboard game from the ground up on @form/core, a small JavaScript simulation framework (things, sites, links, states, derived signals, systems, watches, views). The game's library is a set of editable files (main.js, rigid.js, skate/*.js, experiments.js). The person you are helping sees the code, a live drafting-style stage, traces, events, params and a dataflow graph.

You have one tool, eval: it runs an async JavaScript function body in the page and returns the value (as YAML) plus anything you console.log. Use it to read files, edit them, rebuild, test tricks headlessly, read traces and events, and change params. The scope is described below under "The agent's eval scope". Keep results small: pick fields, slice arrays.

How to work:
- Look before you change: files.grep / files.read(path, from, to) to find code; describe(id) / inspect(pattern) for the compiled program.
- Change code with files.edit(path, find, replace) (exact, unique text) rather than rewriting files. Then call run() — the running world keeps its state — and read the result: { ok, errors }.
- Verify with test({ trick: 'kickflip' }) or test({ script, seconds, opts }) — a fresh headless world — and look at tricks / events / failed. Compare before and after when tuning.
- In Ask mode the person approves each eval; in Read-only mode edits are refused: say what you would change instead.
- Answer in a few short paragraphs of markdown. Name files and lines; you may include lab: links, which the person can click: [open](lab:open?file=skate/motors.js&line=120), [pin](lab:trace?id=recognizer/flipTurns), [try it](lab:trick?name=kickflip), [select](lab:node?id=pop/pop), [doc](lab:doc?id=rigid-bodies). Use $…$ for maths.
- Physics is in SI units: metres, seconds, kilograms, newtons, radians. The step is 1/120 s with 8 substeps.
${host.reference}
```

## What each part does

| part | its job |
|---|---|
| The first paragraph | Says where the agent is and what the person sees, so the agent can refer to the stage, traces, events, params and graph by name. |
| "You have one tool, eval" | Explains the tool in one paragraph, points to the scope section of the Reference, and sets the first habit: keep results small. |
| "How to work" | The working loop in four steps: look (`files.grep`, `files.read`, `describe`, `inspect`), edit (`files.edit`, exact and unique), rebuild (`run()`), verify (`test`, before and after). |
| The modes line | Tells the agent what Ask and Read-only mean for it, and what to do when an edit is refused. |
| The answer line | Sets the shape of answers: a few short paragraphs of Markdown, files and lines named, `lab:` links, `$…$` maths. Its five example links are real actions. |
| The units line | SI units and the 1/120 s step, so measured numbers are read correctly. |
| The Reference | Every name the agent can call, the same document the person reads in the Reference tab. Its last section, "The agent's eval scope", lists the scope. |

## The context block

From `context(host)` in `app/ui/agent.jsx:88–100`:

```js
function context(host) {
  const rt = host.rt, p = host.preset, bi = host.buildInfo;
  const lines = [`preset: ${p.id} ${p.title} (${p.group}) — ${p.about || ''}`];
  if (rt) lines.push(`world: t = ${rt.time.toFixed(2)} s, ${host.running ? 'running' : 'paused'} at ${host.speed}×, driver ${host.autopilotOn() ? 'autopilot' : 'person'}`);
  lines.push(bi ? (bi.ok ? `build: ok (${bi.stats ? `${bi.stats.systems} systems, ${bi.stats.signals} signals, ${bi.stats.states} states` : ''})` : `build: FAILS — ${bi.message}`) : 'build: none');
  const errs = host.diags.filter(d => d.severity !== 'info'); if (errs.length) lines.push('diagnostics:\n' + errs.slice(0, 8).map(d => `  ${d.severity} ${d.src ? d.src.file + ':' + d.src.line : ''} ${d.message}`).join('\n'));
  if (rt && rt.failed) lines.push(`runtime stopped: ${rt.failed.system} — ${rt.failed.error.message} at ${rt.failed.src ? rt.failed.src.file + ':' + rt.failed.src.line : '?'}`);
  lines.push('files: ' + Object.keys(host.files).sort().map(f => f + (host.isDirty(f) ? '*' : '')).join(', ') + ' (* edited)');
  if (host.selection) lines.push('selected node: ' + host.selection);
  if (rt) { const tr = rt.events.list({ type: 'trick', last: 5 }).map(e => `${e.data.name}${e.data.landed ? '' : ' (bail)'} flip ${fmt(e.data.measurements.flip)} shove ${fmt(e.data.measurements.shove)} air ${fmt(e.data.measurements.air)}`); if (tr.length) lines.push('last tricks: ' + tr.join('; ')); }
  if (host.pinned.length) lines.push('pinned traces: ' + host.pinned.join(', '));
  return '[context]\n' + lines.join('\n') + '\n[/context]';
}
```

A real block from preset B-01 is quoted in How the agent works. Lines appear only when they apply: diagnostics only when there are warnings or errors, the stopped system only when the runtime failed, the selected node only when there is one, tricks only after some were recognized, pinned traces only when some are pinned.

## Writing instructions for an agent like this

- Keep them short and operational: where the agent is, its one tool, the loop, the modes, the answer shape, the units.
- Append the API reference instead of describing the API in the prompt, and keep that reference the one the person reads.
- Put live state in a context block on the latest turn, not in the instructions, so the instructions stay the same from turn to turn.
