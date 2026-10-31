# Patterns

These are the working habits the agent's instructions ask for, and the ones Chapter 54 of the book ("Working with the agent") shows by measurement. Each says where it comes from.

## Look before you change

*Instructions:* "Look before you change: files.grep / files.read(path, from, to) to find code; describe(id) / inspect(pattern) for the compiled program."

- Do: `return files.grep('spin = ', 'skate/motors.js');`, then read the lines around the hit.
- Don't: write an edit from memory of what the file probably says.

## Edit exact text, then rebuild

*Instructions:* "Change code with files.edit(path, find, replace) (exact, unique text) rather than rewriting files. Then call run() — the running world keeps its state — and read the result: { ok, errors }."

- Do: `files.edit('skate/motors.js', 'spin = 19 }', 'spin = 21 }'); return run();`
- Don't: `files.write` a whole file to change one number. When `edit` throws *text occurs N times*, add context until the text is unique.

## Verify in a fresh world, before and after

*Instructions:* "Verify with test({ trick: 'kickflip' }) or test({ script, seconds, opts }) — a fresh headless world — and look at tricks / events / failed. Compare before and after when tuning."

A before-and-after pair from `test` is exact, because the program is deterministic: any difference comes from the edit. Report both numbers.

## Keep results small

*Instructions:* "Keep results small: pick fields, slice arrays."

- Do: `const k = test('kickflip').tricks[0]; return { name: k.name, landed: k.landed, air: k.air, score: k.score };`
- Don't: `return test('kickflip');` when two fields are wanted. Every round re-reads every earlier result, and results over 9,000 characters are cut.

## Name a measured quantity

*Chapter 54.4:* "Make the kickflip feel snappier" leaves the agent to decide what snappier means; "make the catch come earlier, measured by the `catch` event's `after`" gives it a target and a test. When a request is vague, pick the quantity, say which one, and measure it.

## Sweep everything that shares the changed code

*Chapter 54.4:* the flick motor serves every trick with a flick, so the honest unit to check is the list of gestures. Raising its default spin from 19 to 21 rad/s keeps the kickflip landing (850 → 845 points), and the same sweep finds the change the narrow check misses:

```yaml
- gesture: varialHeelflip
  before: varial heelflip
  after: laser flip
  score: 2373
```

"Yes, it still lands" would have been true and misleading. Use `query(q => q.systems().where(n => n.reads('flick/spin')))` to find who shares a value.

## Say which world a number came from

*Chapter 54.5:* a headless run is exact, but it can answer a different question from the person's.

- Live params do not reach `test`: it builds at the declared defaults. After `setParam('flick/spin', 30)`, `test` still answers for 19 rad/s.
- `opts` replace the preset's build options: `test({ trick, opts })` rebuilds through `createSkateGame(opts)`.
- The stage's world has a history: a gesture pressed in the air or just after a fakie landing behaves differently from the routine `test` plays from rest.
- One run is one sample: a margin needs perturbed runs and a rate.

So state the gestures, the starting state, the param values and any perturbation behind a claim like "it still lands".

## Measure again rather than remember

Earlier step results come back to the model only as a 160-character fragment. When an earlier table matters, run it again or ask the person to keep it (for example with `setNotes`).

## In Read-only, describe the change

*Instructions:* "in Read-only mode edits are refused: say what you would change instead." Give the file, the line and the exact replacement, so the person can switch to Auto or Ask and have it applied.

## Hand the person the way in

*Instructions:* "Name files and lines; you may include lab: links, which the person can click." An answer that changed `skate/motors.js:192` links to it; an answer about a trick links to playing it. See the lab: links section.

## Remember what revert restores

Revert restores files and rebuilds; it does not restore params, and it cannot undo what steps did to the live world. When a step changed a param, say so in the answer.
