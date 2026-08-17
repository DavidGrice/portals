import worldIndex from '../../data/worlds/index.json';
import fourHalls from '../../data/worlds/two-rooms.json';
import hauntedHouse from '../../data/worlds/haunted-house.json';

const WORLD_DATA = {
  'two-rooms': fourHalls,
  'haunted-house': hauntedHouse,
};

export function listWorlds() {
  return worldIndex.worlds ?? [];
}

export function getWorldData(id) {
  return WORLD_DATA[id] ?? WORLD_DATA['two-rooms'];
}

export function bindWorldSelect({ root, worlds = listWorlds(), onPick, onBack } = {}) {
  if (!root) {
    return { worlds };
  }
  root.replaceChildren();
  const head = document.createElement('div');
  head.className = 'world-select-head';
  const title = document.createElement('h2');
  title.textContent = 'Select a world';
  head.append(title);
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
