// Shared helpers for the dev-only plan tools.
// PRIVACY: everything these tools read (architecture-plans/) or write (.plans-cache/)
// is git-ignored and must never be committed or shipped.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PLANS_DIR = path.join(ROOT, 'architecture-plans');
export const CACHE_DIR = path.join(ROOT, '.plans-cache');

/** 1:50 sheets: 1 m = 20 mm on paper = 20 / 25.4 * 72 PDF points. */
export const PT_PER_M_1_50 = (20 / 25.4) * 72;

export function requirePlans() {
  if (!fs.existsSync(PLANS_DIR)) {
    console.error(
      'architecture-plans/ not found. The plan tools are local-only (the PDFs are never committed).',
    );
    process.exit(1);
  }
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

export function listSheets() {
  return fs
    .readdirSync(PLANS_DIR)
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .sort();
}

/** Resolve a sheet by its number prefix ("05") or full file name. */
export function findSheet(idOrName) {
  const sheets = listSheets();
  const hit = sheets.find((s) => s === idOrName || s.startsWith(`${idOrName} `));
  if (!hit) throw new Error(`Sheet "${idOrName}" not found. Available: ${sheets.join(', ')}`);
  return hit;
}

export async function loadPdf(file) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(path.join(PLANS_DIR, file)));
  return pdfjs.getDocument({ data, verbosity: 0 }).promise;
}

export function sheetSlug(file) {
  return file.replace(/\.pdf$/i, '').slice(0, 2);
}
