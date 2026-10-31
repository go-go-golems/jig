// callsite.js · where in script.js a builder call was made. Shared by core (sketch ops and j.c.* constraints) and
// the kernel (part features, assembly components, print items); it imports nothing, so core does not depend on the
// kernel. Scripts are evaluated with //# sourceURL=script.js and a one-line header (worker.js runScript), so the
// first script.js frame of the stack, less one, is the line in the person's file.

export function callerLine() {
  const st = new Error().stack ?? '';
  const m = /script\.js:(\d+):(\d+)/.exec(st);
  return m ? { line: +m[1] - 1, column: +m[2] } : null;   // the script header adds one line
}

// stamp a builder record with its script line as a non-enumerable `line`: cache keys (keyOf, canon) walk
// enumerable keys only, so moving a call to another line does not invalidate a solve or a feature
export function stampLine(rec) {
  const at = callerLine();
  if (at) Object.defineProperty(rec, 'line', { value: at.line, enumerable: false });
  return rec;
}
