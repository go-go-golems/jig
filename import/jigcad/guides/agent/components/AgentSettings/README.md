# AgentSettings

The bar of three small segmented controls, Mode, Model and Thinking, under the threads.

```html
<div class="agent-set">
  <span class="ctl-l">Mode</span>
  <div class="seg sm" role="group">
    <button class="on" aria-pressed="true" title="runs each step">Auto</button>
    <button aria-pressed="false" title="you approve each step">Ask</button>
    <button aria-pressed="false" title="no edits">Read-only</button>
  </div>
  <span class="ctl-l">Model</span> … Fast · Balanced · Deep
  <span class="ctl-l">Thinking</span> … Auto · Low · Med · High
</div>
```

**You provide** the current values and a change handler; the app saves them per browser.

- Labels are `ink-2` at `fs-xs`. A small segment is 24px tall with 8px side padding; the pressed one inverts to an `ink` fill with `bg` text.
- The bar wraps onto a second row in a narrow tile (row gap 6px, column gap 8px) and its padding drops to 6px 12px under 640px.
- Values sent: Fast `quick`, Balanced `default`, Deep `complex`; Thinking Auto sends nothing, Low/Med/High send `low`/`medium`/`high`.
- Do keep each option one short word. Don't add a fourth control here; settings that change per step belong in the step.
