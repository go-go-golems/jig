# Callout

A boxed paragraph set off from the text by a 2px left rule: Try it (red rule on a red wash), Exercise (outlined), Careful (dashed rule) and a plain one (grey fill).

## Use

Written as a Markdown block quote whose first bold word picks the style (`app/markdown.js`):

| starts with | class | looks like | for |
|---|---|---|---|
| **Try it.** / **Try.** / **Play.** | `.callout.try` | accent left rule on sel | steps the reader can do in the workbench in under two minutes, made of lab: links |
| **Exercise.** / **Challenge.** | `.callout.exercise` | hair box with an ink left rule, no fill | a task to do in the code |
| **Careful.** / **Caveat.** / **Warning.** / **Watch out.** / **Note.** | `.callout.caveat` | dashed ink left rule, no fill | a trap or a limit of the model |
| anything else | `.callout` | ink left rule on fill | an aside |

## Markup

```markdown
> **Try it.** [Load D-03](lab:preset?id=D-03), [switch to front elevation](lab:view?name=front) and [play a kickflip](lab:trick?name=kickflip).
```

## Do and don't

- Do make every Try it a sequence of links the reader clicks in order: load the preset first, then act.
- Do keep a callout to one paragraph.
- Don't use a callout to repeat what the text just said.
