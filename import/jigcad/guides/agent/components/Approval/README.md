# Approval

In Ask mode, a step opens with its code and two buttons and waits for the person before it runs.

```html
<details class="tool ask" open>
  <summary><i class="dot"></i><span class="nm">eval</span><span class="first">const names = ['ollie', …</span><span class="ms">waiting for you</span></summary>
  <div class="tb">
    <pre class="src">…</pre>
    <div class="row"><button class="btn primary sm">Run this step</button><button class="btn sm">Decline</button></div>
    <div class="row"><button class="link">copy code</button></div>
  </div>
</details>
```

**You provide** a promise the buttons resolve: `true` to run, `false` to decline. Abort resolves it with `false`.

- The box and dot are `accent`, the dot blinks, and **waiting for you** replaces the time in bold `accent`.
- **Run this step** is the primary button (`ink` fill, `bg` text); **Decline** is the plain small button.
- A declined step becomes a failed step with the result *The person declined this step.*; the model receives *Declined by the person. Ask what they want instead, or explain the change without running it.*
- Do show the whole code before asking. Don't ask for approval of a summary.
