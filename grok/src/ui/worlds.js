import worldIndex from '../../data/worlds/index.json' with { type: 'json' };
import fourHalls from '../../data/worlds/two-rooms.json' with { type: 'json' };
import hauntedHouse from '../../data/worlds/haunted-house.json' with { type: 'json' };
import circuitGrid from '../../data/worlds/circuit-grid.json' with { type: 'json' };
import ages from '../../data/worlds/ages.json' with { type: 'json' };
import drift from '../../data/worlds/drift.json' with { type: 'json' };

const WORLD_DATA = {
  'two-rooms': fourHalls,
  'haunted-house': hauntedHouse,
  'circuit-grid': circuitGrid,
  ages,
  drift,
};

export function listWorlds() {
  return (worldIndex.worlds ?? []).filter((world) => world.status !== 'draft');
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
