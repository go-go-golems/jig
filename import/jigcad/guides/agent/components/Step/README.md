# Step

One eval call as a collapsible box: a one-line summary, and inside it the code, the result and the step's links.

```html
<details class="tool">
  <summary><i class="dot"></i><span class="nm">eval</span><span class="first">return files.grep('spin = ', 'skate/motors.js');</span><span class="ms">5 ms</span></summary>
  <div class="tb">
    <pre class="src"><!-- code highlighted with .tk-* spans --></pre>
    <pre class="res">- "skate/motors.js:192  exports.flickMotor = …"</pre>
    <div class="row"><button class="link">revert files to before this step</button><button class="link">copy code</button></div>
  </div>
</details>
```

**You provide** the step record: `code`, `result`, `ms`, and the flags `running`, `asking`, `error`, `changed`, `reverted`.

| state | class | summary | look |
|---|---|---|---|
| done | `tool` | time in ms | `hair` box, `ink` dot |
| running | `tool run` | running… | the dot blinks |
| waiting for approval | `tool ask` | **waiting for you** in `accent` | `accent` box and blinking dot, opened (see Approval) |
| failed or declined | `tool err` | time | `accent` box and dot; the result is `accent` with an `accent` left rule |
| reverted | `tool reverted` | time | whole box at 0.55 opacity, first line struck through; *reverted* in `ink-2` replaces the revert link |

- The summary grid is dot (8px column), **eval**, the first non-empty code line in the `code` family (cut with an ellipsis), and the time.
- Inside, the code is `ink` on `code-bg` with a `hair` frame, up to 280px tall; the result is YAML, pre-wrapped, behind a 2px `hair` left rule, up to 260px tall.
- *revert files to before this step* shows only when the step changed files and its snapshot still exists (it is not saved across reloads). Reverting marks this step and every later step in the turn as reverted, rebuilds, and toasts *Reverted the files to before that step and rebuilt*.
- *copy code* copies the code and toasts *Copied*.
- Steps start folded; one opens on its own only while it waits for approval.
- Do show the code exactly as the model sent it. Don't summarise a step in prose; the first line of code is the summary.
