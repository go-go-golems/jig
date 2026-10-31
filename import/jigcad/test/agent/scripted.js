// Scripted stand-ins for the `sample` capability, used by the render test page. Each runs the real eval tool
// against the host it is given, so the step results on screen are what the code returned.

export const REQUEST = 'Make the walls 2.4 mm and check the mass';

export const STEPS = [
  "return files.grep('wall', 'script.js');",
  "return { mass: program.metrics('mass').mass, rim: measure.face('body/end').area, floor: measure.face('shell/floor').area };",
  "files.edit('script.js', 'wall: mm(2)', 'wall: mm(2.4)');\nconst r = await run();\nreturn { ok: r.ok, errors: r.errors, warnings: r.warnings, faces: r.summary.faces };",
  "const reads = program.graph().edges.filter(e => e.startsWith('body'));\nreturn {\n  reads, mass: program.metrics('mass').mass.value,\n  rim: measure.face('body/end').area, floor: measure.face('shell/floor').area,\n  wall: measure.distance('body/side[base.l2]', 'shell/inner[body/side[base.l2]]').distance,\n  size: measure.bbox().size,\n};",
];

export const ANSWER = `I changed the \`wall\` param from 2 to 2.4 mm at [script.js:2](lab:open?file=script.js&line=2) and recompiled: ok, 11 faces, no warnings.

Measured on the open program before and after the edit, the mass goes from **19.28 g** to **22.78 g** (solid PLA, from the exact B-rep volume, 15,552 → 18,372 mm³).

The [shell](lab:node?id=shell) is the only feature that reads \`wall\`, so I checked every face it makes: the [rim](lab:face?name=body/end) grows from 384 to 457 mm², the [floor](lab:face?name=shell/floor) shrinks from 2,016 to 1,943 mm², and each inner wall now sits 2.4 mm from its outer face. The outside stays 60 × 40 × 30 mm. Should the floor stay 2 mm thick, or follow the walls?`;

const wait = ms => new Promise(r => setTimeout(r, ms));

async function stream(opts, text) {
  let so = '';
  for (const w of text.split(/(?<= )/)) {
    if (opts.signal && opts.signal.aborted) throw { code: 'cancelled' };
    so += w; opts.onText({ text: so, delta: w });
    await wait(1);
  }
  return so;
}

/** The happy path: four eval steps, then the answer. `calls` collects what the model received. */
export function scriptedSample(calls = []) {
  return async (messages, opts) => {
    calls.push({ messages, opts });
    const [tool] = opts.tools;
    for (const code of STEPS) {
      await wait(20);
      if (opts.signal && opts.signal.aborted) throw { code: 'cancelled' };
      await tool.execute({ code }, { signal: opts.signal });
    }
    const text = await stream(opts, ANSWER);
    return { text, truncated: false };
  };
}

/** A turn with a failed step and a step that changes files, then a second turn that is rate-limited. */
export function troubleSample() {
  let n = 0;
  return async (messages, opts) => {
    const [tool] = opts.tools;
    if (n++ === 0) {
      await tool.execute({ code: "files.edit('script.js', 'wall: mm(3)', 'wall: mm(1.6)');" }, { signal: opts.signal });
      await tool.execute({ code: "files.edit('script.js', 'wall: mm(2)', 'wall: mm(1.6)');\nconst r = await run();\nreturn { ok: r.ok, warnings: r.warnings, mass: program.metrics('mass').mass.value };" }, { signal: opts.signal });
      const text = await stream(opts, 'The walls are now 1.6 mm at [script.js:2](lab:open?file=script.js&line=2); the mass drops to 15.7 g. The first edit failed because the file says `wall: mm(2)`, not `mm(3)`.');
      return { text };
    }
    await wait(10);
    throw { code: 'rate_limited', message: 'slow down' };
  };
}
