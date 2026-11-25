export function RenderWorkArea({ first, last, count, setFirst, setLast, preview, valid }) {
  return <details><summary>Work area · {valid ? last - first + 1 : 0} frames</summary>
    <label>First output frame <input type="number" min="0" max={count - 1} value={first} onInput={e => setFirst(e.currentTarget.valueAsNumber)} /></label>
    <label>Last output frame <input type="number" min="0" max={count - 1} value={last} onInput={e => setLast(e.currentTarget.valueAsNumber)} /></label>
    <button class="btn sm" disabled={!valid} onClick={() => preview(first)}>Preview first</button>
    <button class="btn sm" disabled={!valid} onClick={() => preview(last)}>Preview last</button>
    <button class="btn sm" onClick={() => { setFirst(0); setLast(count - 1); }}>Whole study</button>
    {!valid && <span role="alert">Choose an inclusive interval within frames 0–{count - 1}.</span>}
  </details>;
}
