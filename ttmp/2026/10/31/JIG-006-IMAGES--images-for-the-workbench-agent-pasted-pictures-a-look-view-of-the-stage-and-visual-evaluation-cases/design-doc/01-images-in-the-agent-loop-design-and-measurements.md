---
Title: 'Images in the agent loop: design and measurements'
Ticket: JIG-006-IMAGES
Status: active
Topics:
    - agent
    - llm
    - testing
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: pkg/server/server.go
      Note: start accepts images; toolResult accepts images
    - Path: pkg/sample/gepp/sample.go
      Note: tool-result images become a user multimodal block after the round's tool results
    - Path: import/jigcad/src/host/sample-http.js
      Note: sends request images and tool-result images
    - Path: import/jigcad/src/agent/scope.js
      Note: look() in the lab scope
    - Path: import/jigcad/src/agent/panel.jsx
      Note: paste and attach images to a message
    - Path: import/jigcad/tools/agent-eval/chrome-look.mjs
      Note: headless Chrome renderer for look() in the harness
ExternalSources: []
Summary: "Let the agent see: images the person pastes go with the message, and look() draws the sheet to a JPEG the model receives after the tool results. A live probe showed both lunaroute models read images, and that jigcad serve dropped them; the harness renders look() in headless Chrome."
LastUpdated: 2026-10-31T23:50:00-04:00
WhatFor: "How images travel from the page to the model, and how the harness measures visual cases"
WhenToUse: "When changing the sample protocol, the eval tool's results, or adding visual evaluation cases"
---

# Images in the agent loop: design and measurements

## 1. What the agent cannot do today

The agent reads the program as data: metrics, faces, diagnostics, the script. It never sees the drawing the person
sees. Two kinds of request need the drawing:

- **The person shows something.** "Make it look like this" with a photo or a sketch; "this edge looks wrong" with a
  screenshot of the sheet.
- **The agent checks its own work.** After an edit that compiles, a look at the part catches what metrics miss: text
  engraved mirrored, a hole on the wrong face, a fillet on the wrong edges, a part floating off the bed.

## 2. Probe: do the models see images, and does jigcad pass them on?

A 512 × 384 JPEG (9,881 bytes) with a blue triangle bottom left, a green circle bottom right and a red digit 7 top
right was sent two ways (`scripts/01-vision-probe.py` in this ticket):

| Route | glm-5.3-flash | deepseek-4.1-flash |
|---|---|---|
| lunaroute `/v1/chat/completions` directly, `image_url` data URL | all three shapes, colours, positions and the 7 correct; 307 prompt tokens | all correct; 252 prompt tokens |
| `jigcad serve` `POST /api/sample` with `images` | "NO IMAGE"; 49 input tokens | (not run: same handler) |

Both models read images. `jigcad serve` dropped them: `Server.start` decodes `{input, modelTier, model, effort,
tools}` and has no `images` field, so the image never reached `sample.Request.Images`, although the sample layer
validates images (`sample.ValidateRequest`: at most 4, JPEG, 8 MiB) and attaches them to the last user turn
(`toTurn`). The earlier claim that "the backend already supports images" was true of the sample layer only.

## 3. Design

### 3.1 Request images

`POST /api/sample` accepts `images: [{ mimeType: 'image/jpeg', data: <base64> }]`, copied into `sample.Request`.
Validation stays where it is. `sample-http.js` sends `o.images` when given. The model must declare image input
(`m.Images()`); otherwise the call fails with `images_unavailable`, as the sample layer already does.

### 3.2 Tool-result images

OpenAI-format tool messages carry text only, and lunaroute replaces images inside Anthropic `tool_result` blocks with
placeholders. An image produced by a tool therefore travels as a **user message after the round's tool results**:

```text
assistant: tool_call eval { code: "return await look('axo')" }
tool:      "image: axo view of box, 640 × 480 (attached below)"
user:      [text "Images from tool calls of this round: 1. eval call_1 — axo view …"] [image_url data:…]
assistant: …
```

- `POST /api/sample/{call}/tools/{use}` accepts `images` next to `value` and `isError`; at most 2 per result and
  4 MiB per result.
- `sample.ToolResult` gains `Images []Image`. `runTools` returns the blocks and the images; `run` appends the
  tool-use blocks, then, if any result had images, one `NewUserMultimodalBlock` with a caption naming each image's
  tool call. Geppetto's OpenAI converter emits the user message after the tool messages (it buffers user blocks
  while tool results are pending), which is the order the API requires.
- A call keeps at most 8 images in its conversation. A tool result beyond that gets its text with the note
  `(image not attached: this call already carries 8 images)`. Images stay in the turn once attached, so prompt
  caching keeps working on the prefix: dropping old images would change the prefix and cost a full re-read.

### 3.3 look() in the lab scope

```js
const img = await look();                       // the current view, 640 × 480
const img = await look('front', { width: 800 }); // a named view: axo, front, side, plan
```

`look` asks the host for a JPEG of the sheet: `host.renderView({ view, width, height })`. The browser host draws with
the stage's own `draw(canvas, program, view, { width, height, dpr: 1, colorsFrom: document.documentElement })` on an
offscreen canvas, so the person's view does not move, and encodes with `canvas.toDataURL('image/jpeg', 0.85)`.
The step registers the image with the eval tool, and the step's text result says what was attached
(`image: front view, 800 × 600, 41 KB (attached below)`). The eval tool returns `{ text, images }` and
`sample-http.js` posts both.

Limits: 2 looks per step, 1600 px per side. `look` is allowed in read mode (it changes nothing).

### 3.4 Pasted and attached images in the panel

The composer accepts paste (`onPaste` with image items) and a file button. Each image is drawn into a canvas and
re-encoded as JPEG, longest side at most 1568 px, quality 0.85 (slop's `prepare()` rule), at most 4 per message.
Thumbnails show under the composer with a remove button. On send, `runTurn` passes them to `sample(turns, { images })`.
The thread stores only a count (`images: 2`), not the bytes: threads live in `localStorage`, which holds a few MB.

### 3.5 Visual cases in the harness

The harness runs the engine in Node, which has no canvas. `look()` there renders in **headless Chrome**: the
harness starts Chrome (`--headless=new --remote-debugging-port`), opens the app served by `jigcad serve`, and speaks
the DevTools protocol over Node's built-in `WebSocket`. For each `look()` it copies the Node host's files and overrides
into the page's `jigHost`, compiles there, and returns the page's `host.renderView(…)`. The Node host gets a
`renderView` that delegates to the page. Without `--look chrome`, `look()` fails with
`look: this workbench cannot draw here`, and visual cases are skipped.

Visual cases ask questions whose answers need the drawing or catch errors that only show in it. Their checks are
the usual ones (file, metric, answer), plus `stepCode` matching `look\(` where looking is the point.

## 4. Measurement plan

- Probe both tiers through `jigcad serve` after the fix: the shapes image, and a `look()` of A-01 asked "what is
  this part".
- Run the visual cases × 2 tiers × 3 repeats with `--look chrome`, and the full set once to compare tool calls and
  input tokens with and without `look` available.

## 5. Results

### 5.1 Transport

| Probe | default (glm-5.3-flash) | complex (deepseek-4.1-flash) |
|---|---|---|
| request image through `jigcad serve`, before the fix | "NO IMAGE", 49 input tokens | – |
| request image through `jigcad serve`, after | all shapes, colours, positions and the 7; 317 input tokens | all correct; 263 |
| tool-result image (`scripts/02-tool-image-probe.mjs`) | all correct, with pixel coordinates; 738 input tokens, 2 rounds | "The picture did reach me", all correct; 976, 2 rounds |
| panel in a browser (Playwright): attached drawing + "match it, then look at the plan" | read 80 × 50 from the drawing, edited, `look('plan')`, described the hatched shadow it saw | – |

### 5.2 Visual cases (3 cases × 2 tiers × 3 repeats, `--look chrome`)

| Case | default | complex | looks per run (default / complex) |
|---|---|---|---|
| v01-s01-describe (read mode: look and describe the outline) | 3/3 | 3/3 | 1.3 / 2.7 |
| v02-a01-engrave-front (engrave JIG on −Y, look at the front, confirm it reads left to right) | 2/3 | 3/3 | 1 / 1.7 |
| v03-a01-footprint-drawing (attached drawing, no mention of looking) | 3/3 | 3/3 | 0.7 / 1.3 |

24 renders took 2.0 s in total in headless Chrome. `look()` is cheap; the cost is in the model's rounds: deepseek used
6–13 tool calls and 47–111 s on v01/v02, glm 1–4 calls and 8–26 s.

In **v03**, nothing in the request asks the agent to look, and it looked anyway in 5 of 6 runs to check its edit
against the drawing.

### 5.3 The failure: a picture overriding a warning

glm's v02 run #2 wrote `.emboss(j.region.text('JIG', { size: 10, align: 'center' }), mm(-0.6), { on: … })`, a
negative depth. The engine compiled it with `warning feature.noEffect: engrave: the cut removes no material` and
22 faces (the letters imprinted on the face, nothing cut). `run()` returned `warnings: 1`, a count without the text.
The model wrote "volume unchanged at 15344 mm³ — the cut is too small to dent the figure much", called
`look('front')`, and answered "JIG reads left to right". Rendering its edit (`scripts/03-render-emboss-variants.mjs`)
shows why: the front view of the imprint shows the letters in light lines (`various/v02-neg.jpg`), and a correct cut
looks the same from the front. The picture confirmed the orientation correctly and said nothing about depth. The
metrics and the warning did say something, and the model chose the picture.

Two consequences:

- `run()` should return warnings as `{ kind, message }` like errors, not as a count; the warning text was the
  evidence the model needed and never read. This changes every turn's results and should be measured on its own.
- The reference's `look()` entry should say what a drawing cannot show (depth, hidden faces) and point to metrics
  and diagnostics for those.

### 5.4 Does the agent look when nobody asks?

The 28 non-visual cases ran once per tier with `look()` available (`various/runs/2026-11-01-look-available`;
the case filter also matched the three `v0…` cases, which are excluded here).

| Tier | Runs | Passed | Runs that called `look()` | Cases |
|---|---|---|---|---|
| default (glm) | 28 | 24 | 3 | h04-switch-toggle, a01-engrave, a01-bigger-clarify |
| complex (deepseek) | 28 | 27 | 4 | h04-switch-toggle, h01-large, a01-mount-holes, a01-bigger-clarify |

The agent looks rarely and only on edits whose shape matters: a different switch plate, an engraving, holes, a new
size. It never looked on questions, diagnostics or parameter edits. 20 renders took 2.3 s. Four of the five failures
were infrastructure (glm: three `rate_limited`; deepseek: one `authentication_error` from lunaroute). The fifth,
glm's m07-tooth-gap, answered "backlash 0.4 mm … split across the two flanks" where the case expects the ≈ 0.2 mm
smallest gap the interference check measures. The question "how much clearance is there between the teeth" fits
both quantities. That is a case ambiguity (JIG-005), and the question should name the interference gap.

### 5.5 Conclusion

Images work end to end, in both directions, on both models. `look()` is cheap to render, is used sparingly and
sensibly without prompting, and helps where the request is about appearance (v03: the agent verified its edit against
the drawing). It also introduces a new failure: a picture can confirm what it shows, such as letters and orientation,
while the model ignores evidence it cannot show, such as depth. The next change is to make `run()` report warning
text, so that such evidence is in front of the model whether it looks or not.
