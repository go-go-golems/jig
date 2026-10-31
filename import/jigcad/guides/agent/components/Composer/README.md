# Composer

The input at the foot of the panel: a textarea, a line of hints, and Send or Stop.

```html
<div class="composer">
  <textarea placeholder="Ask the agent: “make heelflips catch earlier”, “add a manual trick”, “why did that bail?”" aria-label="Message to the agent"></textarea>
  <div class="row">
    <span class="meta">Enter sends · Shift+Enter for a new line · steps run as they come</span>
    <button class="btn primary">Send</button>          <!-- while a turn runs: <button class="btn danger">Stop</button> -->
  </div>
</div>
```

**You provide** the draft text, the mode (for the meta line), whether a turn is running, and send and stop handlers.

- The textarea sits on `code-bg` in a `hair` frame that turns `ink` on focus, 54px tall and resizable up to 160px.
- Enter sends; Shift+Enter adds a line. The meta line ends with the mode: *steps run as they come*, *you approve each step* or *read-only*.
- **Send** is the primary button and is disabled (0.4 opacity) while the draft is empty or Claude is unavailable. While a turn runs it is replaced by **Stop** in `accent`, which aborts the call.
- A `lab:ask?q=…` link fills the textarea and leaves the sending to the person.
- Do keep the placeholder as example requests. Don't send on blur or on a timer.
