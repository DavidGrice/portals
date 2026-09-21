import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const folders = {
  worlds: 'data/worlds',
  kits: 'data/kits',
};

export function readDataJson(kind, file) {
  const folder = folders[kind];
  if (!folder) {
    throw new Error(`Unknown data folder: ${kind}`);
  }
  if (!file || file.includes('..') || file.includes('/') || file.includes('\\')) {
    throw new Error(`Bad data file: ${file}`);
  }
  return JSON.parse(readFileSync(join(root, folder, file), 'utf8'));
}
