# lab: links

A `lab:` link is an ordinary Markdown link whose target starts with `lab:`. In an agent answer it is how the agent hands the person a place or an action: open this line, pin this trace, play this trick. The same links work in notes, docs, the Reference and the book.

## How they render and run

The renderer turns `[text](lab:…)` into `<a href="#" class="lablink" data-lab="lab:…">text</a>`. In an answer the link is underlined in `ink` with an `accent` underline colour, followed by a small `accent` ▸ marker (`.doc-inline a.lablink::after`). A click calls `host.link(href)`.

`host.link` replaces `lab:` with `lab://x/` and parses the result as a URL: the path is the action, the query holds the parameters, decoded the way a browser decodes a form. Nothing checks a link before it is clicked; a target that does not exist shows a red toast such as *no trace …*, and an `open` link whose `find` text is missing opens the file at line 1.

## The actions

| action | parameters | does |
|---|---|---|
| `open` | `file`, then `find` or `line` | opens a file in Code at a line; prefer `find`, which survives edits above it |
| `trace` (or `pin`) | `id`, comma-separated | pins signals and states in Traces |
| `node` (or `select`) | `id`, optional `in` | selects a node in the Graph and shows its Inspector |
| `trick` (or `perform`) | `name` | plays a gesture 0.02 s after the click, as the person's input |
| `param` | `id`, optional `value` | sets a param in the running world; without a value, opens it in Params |
| `preset` | `id` | loads a preset |
| `doc` | `id`, optional `at` | opens a shelf doc at a heading's slug |
| `book` | `ch`, optional `at` | opens a chapter of the book (`P`, 1–62, `A`–`F`) |
| `view` | `name`, optional `track` | sets the stage camera: `axo`, `front`, `side`, `plan` |
| `overlay` | `name`, optional `on` | shows, hides or toggles a stage overlay |
| `speed` | `x` | sets the time scale |
| `show` (or `tile`) | `view` | brings a view forward (`agent`, `code`, `traces`, …) |
| `order` | `name` | picks a depth-order strategy |
| `exp` (or `run`) | `name` | runs an experiment |
| `record` | optional `trick`, `seconds`, `replay` | records a clip headless and replays it |
| `replay`, `score` | none | replays the current clip; scores its drawing order |
| `reset`, `build` | none | restarts the world; rebuilds keeping the world |
| `autopilot` | optional `on` | hands the board to the autopilot, or takes it back |
| `ask` | `q` | puts a question in the agent's composer; it does not send it |

## Writing them

The link text says what the click does or where it goes: [skate/motors.js:192](lab:open?file=skate/motors.js&line=192), [play a kickflip](lab:trick?name=kickflip), [pin the flip turns](lab:trace?id=recognizer/flipTurns).

Escape these characters inside a parameter value:

| in a value | write | because |
|---|---|---|
| a space | a space | spaces are allowed and decoded back |
| `&` | `%26` | `&` separates parameters |
| `#` | `%23` | `#` starts a fragment, which is dropped |
| `+` | `%2B` | `+` decodes to a space |
| `%` | `%25` | `%` starts an escape |
| `(` and `)` | at most one balanced pair, or `%28` and `%29` | the renderer finds the end of the link by its parentheses |
| `$` | avoid | the renderer reads it as the start of inline maths |

A link to a file, param, signal, node, gesture or experiment refers to the program that is loaded. An answer is about the loaded preset, so its links resolve; a note that depends on another preset loads it first with a `preset` link.

## In the agent's scope

The agent can follow a link itself with `link(href)`, and open a chapter for the person with `book.open(n, at)`, which is `link('lab:book?ch=' + n + (at ? '&at=' + at : ''))`.
