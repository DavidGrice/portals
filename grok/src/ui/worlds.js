import worldIndex from '../../data/worlds/index.json' with { type: 'json' };
import { readDataJson } from '#json-read';

const cache = new Map();

export function listWorlds() {
  return (worldIndex.worlds ?? []).filter((world) => world.status !== 'draft');
}

export function getWorldData(id) {
  const entry = (worldIndex.worlds ?? []).find((world) => world.id === id);
  if (!entry) {
    throw new Error(`Unknown world: ${id}`);
  }
  if (cache.has(entry.file)) {
    return cache.get(entry.file);
  }
  const data = readDataJson('worlds', entry.file);
  cache.set(entry.file, data);
  return data;
}

export function bindWorldSelect({ root, worlds = listWorlds(), onPick, onBack, seed = '', onSeed } = {}) {
  if (!root) {
    return { worlds };
  }
  root.replaceChildren();
  const head = document.createElement('div');
  head.className = 'world-select-head';
  const title = document.createElement('h2');
  title.textContent = 'Select a world';
  head.append(title);
  if (worlds.some((world) => world.id === 'drift')) {
    const seedRow = document.createElement('label');
    seedRow.className = 'world-seed';
    seedRow.append('Drift seed ');
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 16;
    input.placeholder = 'random';
    input.value = seed;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.addEventListener('click', (event) => event.stopPropagation());
    input.addEventListener('input', () => onSeed?.(input.value.trim()));
    seedRow.append(input);
    head.append(seedRow);
  }
  root.append(head);

  const grid = document.createElement('div');
  grid.className = 'world-grid';
  for (const world of worlds) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'world-card';
    card.dataset.worldId = world.id;
    const shot = document.createElement('span');
    shot.className = 'world-card-shot';
    if (world.preview) {
      shot.style.backgroundImage = `url(${world.preview})`;
    }
    const meta = document.createElement('span');
    meta.className = 'world-card-meta';
    const name = document.createElement('strong');
    name.textContent = world.title;
    const blurb = document.createElement('em');
    blurb.textContent = world.blurb ?? '';
    meta.append(name, blurb);
    card.append(shot, meta);
    card.addEventListener('click', () => onPick?.(world.id));
    grid.append(card);
  }
  root.append(grid);

  const back = document.createElement('button');
  back.type = 'button';
  back.id = 'worlds-back';
  back.className = 'welcome-enter welcome-enter-ghost';
  back.textContent = 'Back';
  back.addEventListener('click', () => onBack?.());
  root.append(back);
  return { worlds };
}
