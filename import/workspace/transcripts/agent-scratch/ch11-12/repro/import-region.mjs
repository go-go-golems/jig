// reference.md: `.import(id, region)` ✓, example .import('logo', j.region.text('A')). Any j.region fails.
import { run } from './_h.mjs';
await run(`return j.sketch('s').import('logo', j.region.text('A'))`);
await run(`return j.sketch('s').import('r', j.region.rect(10, 6))`);
await run(`return j.sketch('s', { mode: 'constrained' }).import('r', [[0, 0], [10, 0], [10, 6], [0, 6]])`);
