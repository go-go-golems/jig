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
