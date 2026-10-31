# Toast

A short message at the bottom centre that confirms or reports, then goes: ink box with bg text, or accent with white text for trouble.

## Use

`host.toast(msg, bad)` pushes onto `.toasts` (at most three shown, stacked upward, 6px apart). Plain toasts last 2.6 s, bad ones 5.2 s. Say what happened in the past tense or what went wrong and what to do: "Copied", "Back to the preset as published", "Saved as U-01", "Recorded {n} frames (20.0 s)" with the clip's own count, "Import failed: " and the parser's message, "Saving files is not available here: kickflips-from-first-principles.md was copied to the clipboard instead".

## Markup

```html
<div class="toasts" aria-live="polite">
  <div class="toast">Copied</div>
  <div class="toast bad">no chapter 99</div>
</div>
```

## Do and don't

- Do start an error with the thing that failed ("Export failed: …", "no trace recognizer/hight").
- Don't use a toast for something the person must act on; that goes in the view (a `.fail` row, the editor's diagnostics).
