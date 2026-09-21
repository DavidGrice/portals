const tables = {
  worlds: import.meta.glob('../../data/worlds/*.json', { eager: true, import: 'default' }),
  kits: import.meta.glob('../../data/kits/*.json', { eager: true, import: 'default' }),
};

export function readDataJson(kind, file) {
  const table = tables[kind];
  if (!table) {
    throw new Error(`Unknown data folder: ${kind}`);
  }
  const hit = Object.entries(table).find(([path]) => path.endsWith(`/${file}`) || path.endsWith(`\\${file}`));
  if (!hit) {
    throw new Error(`Missing ${kind} file ${file}`);
  }
  return hit[1];
}
