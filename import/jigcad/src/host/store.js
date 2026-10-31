// Per-browser conveniences in localStorage, every access wrapped: the artifact runtime may throw on any of them,
// and nothing in the workbench depends on these working.
const PREFIX = 'jigcad.v1.';

export const store = {
  get(key, fallback = null) {
    try {
      const raw = globalThis.localStorage?.getItem(PREFIX + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  },
  set(key, value) {
    try {
      if (value === undefined || value === null) globalThis.localStorage?.removeItem(PREFIX + key);
      else globalThis.localStorage?.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch { return false; }
  },
  remove(key) {
    try { globalThis.localStorage?.removeItem(PREFIX + key); } catch { /* storage unavailable */ }
  },
};
