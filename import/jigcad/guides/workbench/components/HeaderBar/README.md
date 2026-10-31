# HeaderBar

The 52px bar across the top: the name, the preset, the run controls, Run, then status pills, Layout and the theme switch on the right.

## Use

There is one header bar per app. Left to right:

1. `.brand`: "Form Skate" in brand style, then `<i>workbench</i>` (ui-small, 400, ink-2), closed by a 1 px hair rule.
2. `.proj` > `.projbtn`: the preset's code (B-01, `.pcode`), its title (`.ptitle`, 700, 14px), "edited" in `.pcode` when there are unsaved edits, and a ▾ caret. It opens the preset Menu.
3. `.runctl`: Play/Pause, Step, Reset as IconButtons, the clock (`.clock`, bold, tabular, two decimals; `<em>` " stopped" in accent when the runtime failed) and a time-scale `select` (1×, 0.5×, 0.25×, 0.1×, 2×).
4. Run (`.btn`, `.primary` when the code is dirty) with `kbd` ⌘↵.
5. `.sp` spacer, then `.pill`s: build status ("ok" and "16 systems · 15 signals · 42 states"; `.bad` with "2 errors" or "stopped"; `.busy` adds a blinking square), and the score (`.pill.score`: "1,059" "score ×2").
6. Layout menu button (▦ Layout) and the theme IconButton (system → light → dark).

## Markup

```html
<header class="bar">
  <div class="brand">Form Skate <i>workbench</i></div>
  <div class="proj"><button class="projbtn"><span class="pcode">B-01</span><span class="ptitle">Flatground</span><span class="caret">▾</span></button></div>
  <div class="runctl">…<span class="clock">5.66<em></em></span><select>…</select></div>
  <button class="btn">Run<span class="long"> <kbd>⌘↵</kbd></span></button>
  <span class="sp"></span>
  <button class="pill"><b>ok</b><span>16 systems · 15 signals · 42 states</span></button>
</header>
```

## Narrow screens

Under 1180px pill sub labels hide; under 900px "workbench" hides; under 640px the pills, the time scale and the Layout menu hide, and `.long` texts swap for `.short` ones. Hide words, never controls the user needs to run the program.

## Do and don't

- Do keep the bar on bg with a hair rule under it; no fill, no shadow.
- Do make a pill a button when it leads somewhere (the build pill opens Code on errors, Graph otherwise).
- Don't add a logo: the name set in type is the mark.
