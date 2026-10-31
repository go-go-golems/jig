# UserMessage

The person's message: a **You** label over their words in a 1px `ink` box.

```html
<div class="msg user"><span class="who">You</span><div class="body">Make the kickflip spin faster and check it still lands</div></div>
```

**You provide** the text exactly as sent.

- The label is `ink-2` at `fs-xs`, 4px above the box. The box has 8px 10px padding, keeps line breaks (`pre-wrap`), sits at the left and is at most 92% wide.
- The person's message is the only box drawn in `ink`; the agent's answer has no box. That difference, not colour, tells the two apart.
- Don't render the person's text as Markdown.
