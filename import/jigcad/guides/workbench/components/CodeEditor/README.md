# CodeEditor

The library editor: a 54px gutter of line numbers and declaration glyphs, highlighted code on code-bg, the error line washed red, diagnostics under it and a one-line build footer.

## Use

The editor is a transparent `textarea` over a `pre` that holds the highlighted lines (`highlightLines` in `app/highlight.js`), both at 12px/18px in the code face so they line up. Run is Ctrl/Cmd+Enter (or Ctrl+S); Ctrl+/ comments lines; Tab indents two spaces; Enter keeps the indentation and adds two after an opening bracket.

- **Gutter** (`.egutter .gutter-in`): line numbers in tok-com. A declaration gets a glyph button before its number that selects it in the Graph: ■ system, λ signal, ○ state, ◇ param, ◎ watch, ▢ view, △ thing. An error line's number is accent and bold (`.err`); a warning's is ink and bold (`.warn`).
- **Code**: keywords bold, strings grey, comments italic and faint, `=>` red and bold (the only colour in code), punctuation faint. The caret is accent; the selection is sel.
- **Error line**: `.ln-err` washes the whole line in sel.
- **Diagnostics** (`.diags`, under an accent rule): one `.diag` button per error (×, accent) or warning (!) with `file:line` and the message; clicking opens the place.
- **Footer** (`.ed-foot`): `compiled` in bold, the time and what the hot edit kept, or `does not compile: …` in accent; then notes, the cursor position and "revert file".

## Markup

```html
<div class="ed">
  <div class="egutter"><div class="gutter-in"><div><button class="gl" title="system pop/pop">■</button>153</div></div></div>
  <div class="code"><pre aria-hidden="true"><div>…highlighted line…</div></pre><textarea aria-label="Source of skate/motors.js"></textarea></div>
</div>
<div class="diags"><button class="diag bad"><b>×</b><span class="ln">skate/motors.js:156</span><span>…</span></button></div>
<div class="ed-foot"><span><b>compiled</b> in 7.6 ms · hot: kept 37 states, …</span><span class="sp"></span><span>Ln 156, Col 25</span></div>
```

## Do and don't

- Do report a build in numbers: milliseconds, what was kept, how many systems and signals.
- Don't add colour themes for code; the token colours are tokens (tok-*) and change with the light and dark themes only.
