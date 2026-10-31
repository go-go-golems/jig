# ThreadTabs

A strip of tabs, one per conversation thread, with **+ New** pinned to the right.

```html
<div class="threads">
  <span class="th on"><button>Make the kickflip spin faster an</button><button class="x" aria-label="close thread">×</button></span>
  <span class="th"><button>New thread</button><button class="x" aria-label="close thread">×</button></span>
  <button class="new">+ New</button>
</div>
```

**You provide** the threads (`{ id, title }`), the active id, and handlers for select, close and new.

- The active tab is `ink` and bold with a 2px inset `ink` underline; the others are `ink-2`. Tabs are `fs-xs`, divided by `hair` rules.
- A thread is titled *New thread* until its first message, then by the first 32 characters of that message, cut without an ellipsis.
- The close × turns `accent` on hover. Closing the last thread leaves a fresh *New thread*.
- **+ New** stays visible while the strip scrolls sideways (`position: sticky`) and is disabled while a turn runs.
- Do keep titles as the person's own words. Don't rename threads with a summary the model wrote.
