// The engine worker's entry (dist/worker.js): the message loop of worker.js on this worker's global.
import { serve } from './worker.js';

serve(self);
