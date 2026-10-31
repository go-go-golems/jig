// Content fixtures for the real Host, set before src/host/content.js loads (it reads globalThis.__JIG_CONTENT__).
import { PRESET } from '../mock-host.js';
globalThis.__JIG_CONTENT__ = { presets: [PRESET] };
