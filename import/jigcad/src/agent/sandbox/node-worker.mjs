// The Node sandbox worker's entry: register the module hooks the workbench modules need in Node (.md/.json as text,
// the engine tests' core.js shim), then serve the control port with the runner.
import { register } from 'node:module';
import { workerData } from 'node:worker_threads';

register(new URL('../../../tools/agent-eval/loader.mjs', import.meta.url).href);
const { serveControl } = await import('./runner.js');
serveControl(workerData.port);
