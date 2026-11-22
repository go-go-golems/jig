// node.ts — read the content tree from disk (for scripts and tests that run in Node).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog, type CandelaData } from './catalog';

export const CONTENT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../content');

export function readContent(dir = CONTENT_DIR): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (rel: string) => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const p = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) { if (p !== 'gen') walk(p); } else if (/\.(md|js)$/.test(e.name)) out[p] = fs.readFileSync(path.join(dir, p), 'utf8');
    }
  };
  walk('');
  return out;
}

export const loadCatalogFromDisk = (dir = CONTENT_DIR): CandelaData => loadCatalog(readContent(dir));
