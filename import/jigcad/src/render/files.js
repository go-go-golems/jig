// Which project files are the look (JIG-016): look.js, and any file named *.look.js that a look imports (baked
// poses, shared materials). They go to Candela's build with the CAD package, never to jig's compile, and editing
// them does not make the model dirty. Shared by the workbench host (src/host/host.js) and the Render view.
export const LOOK_FILE = 'look.js';
export const isLookFile = (path) => path === LOOK_FILE || /\.look\.js$/.test(path);
/** the files jig's compile takes: all but the look's */
export const modelFiles = (files) => Object.fromEntries([...(files instanceof Map ? files : Object.entries(files))].filter(([k]) => !isLookFile(k) && k !== 'cameras.json' && k !== 'shots.json' && k !== 'render-studios.json'));
