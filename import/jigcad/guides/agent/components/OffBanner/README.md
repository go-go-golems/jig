# OffBanner

A boxed notice above the log that says the agent cannot run here and that the rest of the workbench still works.

```html
<div class="agent-off"><b>The agent is off here.</b>Claude is not available in this view, so the agent cannot run. Everything else in the workbench works.</div>
```

**You provide** the sentence for the cause (see Modes and permissions for every code and its sentence).

- 1px `ink` box, `fs-s`, 8px 10px padding, 10px 16px of margin above and to the sides. The bold first line is always *The agent is off here.*
- It appears when the capability is missing at load (then Send and the suggestions are disabled too) or when a call fails with a code that means the agent cannot work in this view.
- Do say what still works. Don't use `accent` for it: nothing failed that the person did.
