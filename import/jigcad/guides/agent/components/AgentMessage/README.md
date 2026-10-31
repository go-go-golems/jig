# AgentMessage

One agent turn: the **Agent** label, its eval steps in the order they ran, then the rendered Markdown answer.

```html
<div class="msg agent">
  <span class="who">Agent</span>
  <details class="tool">…</details>            <!-- one Step per eval call -->
  <div class="md doc-inline">…rendered answer…</div>
  <span class="note">Stopped.</span>           <!-- only when the turn ended early -->
</div>
```

**You provide** the steps, the answer text and an optional note. Render the answer with the workbench renderer (`render(text, { highlight, toc: false })`) and route clicks on `a.lablink` to `host.link(a.dataset.lab)`.

- While the turn is pending with no text yet, show `<span class="thinking">Thinking</span>`, or `Working` once a step has run; a 6px `ink-2` square blinks after the word.
- The answer streams in: each `onText` call replaces the text with the whole answer so far.
- The answer is `fs-s` with line height 1.55, paragraphs 8px apart; headings are `fs-m` bold; inline code sits on `fill`; `lab:` links are underlined in `accent` with a small `accent` ▸ after them.
- A turn that ended with only a note gets the class `error`, and its **Agent** label turns `accent`.
- Notes are `ink-2` at `fs-xs`: *Stopped.*, *The answer hit the length limit.*, *Too many requests just now; try again in a little while.*, *The conversation is too long. Start a new thread.*, *Claude declined this request.*, *Interrupted: …*
- Do keep the steps above the answer, so the reader sees the evidence first. Don't hide the steps behind a single "show work" toggle; each step folds on its own.
