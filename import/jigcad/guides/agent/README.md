The Form Skate agent is a coding agent that lives in one tile of the workbench and works through a single tool, `eval`, which runs JavaScript in the page with the workbench's lab API in scope. Every step shows up as a collapsible block with its code, its time and its result, and the files are snapshotted before each step so the person can revert it.

Use this system to build the same kind of agent into another tool, to extend this one, or to write the way it writes. Start with the section that matches the job:

- **How the agent works**: the turn, the tool rounds, what the model receives, step records, revert, threads and storage.
- **The eval tool**: the tool schema, how code runs, every name in the scope, the YAML result format, the Read-only guard.
- **Modes and permissions**: Auto, Ask and Read-only; Model and Thinking; what the panel says when Claude is unavailable or a turn fails.
- **Patterns**: how the agent should work, with do and don't examples.
- **Voice**: how its answers read.
- **The system prompt**: the instructions and the context block, quoted in full.
- **lab: links**: the links an answer can carry into the workbench.
- **Extending the agent**: recipes for a new scope function, link action, mode or context line.

## Build an agent like this one

1. **Give the model one tool.** Name it `eval`; its input is `{ code }`, the body of an async function. Run the code against a scope object made for the purpose and return the value as YAML text. Do not add a tool per action: with one tool the model writes the loop (fifteen tests, two fields each, a comparison) and the person reads it.
2. **Build the scope from the app's public API.** Here it is `labScope(host)` from `app/host.js`, plus `console`, `log` and `lab`; the host object itself is deleted from the scope. The scope is documented in the same Reference the person reads, and the whole Reference is appended to the instructions, so the agent's API and the person's are one document.
3. **Bound every step.** Race the code against `eval-timeout` (25 s), cut the result at `result-cut` (9,000 characters) and tell the model how to return less.
4. **Snapshot before, offer revert after.** Copy the files before each step. When the step changed a file, show *revert files to before this step*.
5. **Send instructions once and context every time.** The instructions and the Reference ride on the first user turn; a `[context]` block of live state rides on the latest. Earlier steps go back to the model as one line each.
6. **Let the person choose how much to approve.** Auto runs each step, Ask waits for *Run this step* or *Decline*, Read-only makes every editing path throw.
7. **Plan for absence.** When `claude.use('sample')` gives `null`, show the off banner, disable Send and the suggestions, and keep the rest of the app working. Map every error code to one plain sentence.

## How the agent behaves

- Look before changing: `files.grep`, `files.read`, `describe`, `inspect`.
- Change with `files.edit` on exact, unique text; then `run()` and read `{ ok, errors }`.
- Verify in a fresh world with `test()`, before and after, and report the numbers the run returned.
- Sweep everything that shares the changed code, not only the trick that was named.
- Say which world a number came from: live params, build options and the stage's history do not reach a headless test.
- Answer in a few short paragraphs of Markdown, naming files and lines, with `lab:` links the person can click.

## How it looks

The panel follows the workbench's Kiln rules (Form Skate Workbench, linked below).

- The ground is `bg`, text is `ink`, secondary text is `ink-2`. One family, `ui` (Arial), in two weights, 400 and 700. Sizes come from `fs-xs` (10.5px), `fs-s` (12px) and `fs-m` (13px) only.
- Structure is drawn with `line-1` rules: `hair` for controls and boxes, `rule` for the quietest dividers. No shadows and no rounded corners (`radius-0`). The only tinted grounds are `code-bg` behind code and the textarea, and `fill` behind inline code.
- `accent` red marks what needs the person or what failed: a step waiting for approval, a failed step, the label of a turn that errored, Stop, the small marker after a `lab:` link, and the `=>` arrow in code. Never use it as decoration or as a fill behind text.
- Pressed and primary controls invert: an `ink` fill with `bg` text (the pressed segment, Send, Run this step).
- Show state by form as well as colour. A step's square dot (`dot-step`) blinks while the step runs, turns `accent` and keeps blinking while it waits, stays `accent` when the step failed; a reverted step drops to `opacity-reverted` with its first line struck through; the turn being written shows *Thinking* or *Working* with a blinking square (`dot-thinking`).
- The only motion is the blink: keyframes `bl` (`50% { opacity: 0 }`), 0.8 s, `steps(2)`. Nothing slides or fades.
- Code is in the `code` family at 10.5px. Results are YAML, never JSON.
- Copy is plain and short. The person is **You**, the model is **Agent**. Controls are named Mode, Model and Thinking; their options Auto, Ask, Read-only; Fast, Balanced, Deep; Auto, Low, Med, High. Buttons are verbs: Send, Stop, Run this step, Decline, + New.

## Using the components

`components/bundle.css` is the panel's own CSS; colours and sizes resolve through this system's tokens. Each component's guidelines give the exact markup. There is no JavaScript bundle: the app renders this markup from React, but nothing here depends on React, and the previews are static renditions with real content from the app (the step results in them were produced by running the code shown).

## The other Form Skate systems

- [Form Skate Workbench](https://claude.ai/artifact/5aW5wCqpBBTFm6rtezFLaG): the Kiln shell around this panel, its tokens, controls, editor, reading views and the guide to writing a book section.
- [Form Skate Stage](https://claude.ai/artifact/J3P5XmY4B7uyZJZzgLaZYy): the drafting-sheet stage the agent's runs play out on.
