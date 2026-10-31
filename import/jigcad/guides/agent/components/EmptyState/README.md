# EmptyState

What a new thread shows: one paragraph about the agent and up to six requests to start from.

```html
<div class="agent-log">
  <div class="agent-empty">
    <p>Ask for a change and the agent edits the library, rebuilds, and tests it headlessly. It works through one tool, <b>eval</b>, with the same API you see in the Reference.</p>
    <div class="sugg"><button>Explain how a kickflip happens, from the key press to the trick event</button> …</div>
  </div>
</div>
```

**You provide** the suggestions: the preset's own `tries` first, then *Explain what happens in one step of this program, phase by phase* and *Make the kickflip spin faster and check it still lands*, six at most.

- The paragraph is `ink-2`, at most 520px wide. Suggestions are `hair`-framed buttons stacked 5px apart, sized to their text; the border turns `ink` on hover.
- A click sends the suggestion at once. Suggestions are disabled while a turn runs or when Claude is unavailable.
- Do write suggestions as requests the agent can measure. Don't use them for help text.
