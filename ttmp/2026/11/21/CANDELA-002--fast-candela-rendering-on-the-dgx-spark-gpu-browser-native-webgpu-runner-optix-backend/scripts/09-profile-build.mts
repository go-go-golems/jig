// 09-profile-build.mts — CPU-profile the K-09 build: node --import tsx --cpu-prof --cpu-prof-dir=<dir> <this file>,
// then summarise self time per function from the .cpuprofile (see various/12).
import { build } from '../../../../../../src/engine/candela';
import { loadCatalogFromDisk } from '../../../../../../src/content/node';
const p = loadCatalogFromDisk().presets.find(p => p.id === 'K-09')!;
const t = performance.now(); await build(p.files); console.log('K-09 build+compile', (performance.now() - t).toFixed(0), 'ms');
