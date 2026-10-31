# CodeBlock

Code shown, not edited: a `pre.src` block on code-bg with a hair border, an expression in the inspector, and the IR as text with clickable ids.

## Use

- **`pre.src`**: code and data in panels (10.5px, wraps, at most 280px high and then scrolls; event detail, error source) and in reading views (11.5px, `white-space: pre`, scrolls sideways, full height). Highlight JavaScript with the editor's token classes.
- **`code.exprtxt`**: a signal's expression in the inspector, on code-bg with a hair border: `axisTurns(flipAxis, axis(board/deck, y), takeoff)`.
- **`pre.irtext`**: the compiled program, 11.5px/1.6. Comment lines (`#`) take `.cm` (tok-com). Ids of systems, states and signals are `.nid` buttons that select in the graph; expression nodes (n35) highlight their definition (`.hl`: fill and a 2px accent inset bar).

## Markup

```html
<pre class="src lang-js"><span class="tk-k">const</span> RULES …</pre>
<code class="exprtxt">position(board/deck).y</code>
<pre class="irtext"><div class="cm"># program flatground</div><div>    "id": "<button class="nid">pilot/drive</button>",</div></pre>
```

## Do and don't

- Do quote real code with its file and line nearby (`skate/recognizer.js:58`).
- Don't shrink code below 10.5px or set it in the UI font.
