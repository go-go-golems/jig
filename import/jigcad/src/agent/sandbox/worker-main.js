// The browser sandbox worker's entry (dist/agent-worker.js, JIG-012). The sandbox frame starts it from a blob: URL
// and transfers it the control port in its first message; everything after that goes through the port. The worker
// has no document and inherits the frame's Content-Security-Policy, which refuses every connection.
import { serveControl } from './runner.js';

self.onmessage = e => {
  const m = e.data;
  if (!m || m.t !== 'port' || !m.port) return;
  self.onmessage = null;
  serveControl(m.port);
};
