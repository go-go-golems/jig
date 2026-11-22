// browser.ts — the content tree bundled by Vite: every preset, doc and the reference as raw text, then the catalog.
import { loadCatalog, type CandelaData } from './catalog';

const raw = import.meta.glob(['/content/presets/**/*.{md,js}', '/content/docs/*.md', '/content/reference.md'], {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

const content: Record<string, string> = {};
for (const [k, v] of Object.entries(raw)) content[k.replace(/^\/content\//, '')] = v;

export const CANDELA_DATA: CandelaData = loadCatalog(content);
