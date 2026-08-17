import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PerspectiveCamera } from 'three';
import { BEDS, GameAudio, bedForRoom, mixGain } from '../src/engine/audio.js';
import { loadWorld } from '../src/content/loadWorld.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relative) {
  return JSON.parse(readFileSync(join(root, relative), 'utf8'));
}

function mockRenderer() {
  return {
    autoClear: true,
    shadowMap: { enabled: false },
    clippingPlanes: [],
    setClearColor() {},
    setSize() {},
    getContext() {
      return {};
    },
    state: { buffers: {} },
    clear() {},
    render() {},
  };
}

describe('audio', () => {
  it('mixes master and bus, and mutes to zero', () => {
    assert.equal(mixGain(0.8, 0.5, false), 0.4);
    assert.equal(mixGain(1, 1, true), 0);
  });

  it('does not throw without an AudioContext', () => {
    const audio = new GameAudio();
    audio.applyVolumes({ masterVolume: 0.2, musicVolume: 0.3, sfxVolume: 0.4 });
    audio.tick(0.016, { moving: true, onGround: true, haunt: true, nearFire: true });
    audio.jump();
    audio.whoosh();
    audio.creak();
    audio.whisper();
    audio.rumble();
    audio.crackle();
    audio.mute();
    assert.equal(audio.muted, true);
  });

  it('uses a deeper haunt bed and wind in the attic', () => {
    assert.equal(bedForRoom('foyer'), 'haunt');
    assert.equal(bedForRoom('crypt'), 'hauntDeep');
    assert.equal(bedForRoom('attic'), 'hauntWind');
    assert.ok(BEDS.haunt.sub < 25);
    assert.ok(BEDS.hauntDeep.sub < BEDS.haunt.sub);
    assert.ok(BEDS.hauntDeep.filter < BEDS.haunt.filter);
    assert.equal(BEDS.hauntWind.wind, true);
  });

  it('loads the haunted house and keeps the attic door sealed', () => {
    const world = readJson('data/worlds/haunted-house.json');
    const catalog = readJson('data/catalog.json');
    const camera = new PerspectiveCamera(60, 1, 0.05, 280);
    const controller = loadWorld(world, catalog, camera, mockRenderer());
    assert.equal(controller.currentRoom.id, 'foyer');
    assert.equal(controller.getPortal('door-pa').enabled, false);
    assert.equal(controller.getPortal('door-ap').destinationId, 'door-pa');
    assert.equal(controller.getPortal('door-hd').destinationId, 'door-dh');
    assert.equal(controller.getPortal('door-ck').destinationId, 'door-kc');
    assert.ok(world.rooms.every((room) => room.tags.includes('haunt')));
    assert.ok(world.rooms.length >= 7);
    const ids = new Set(world.rooms.map((room) => room.id));
    assert.ok(ids.has('dining'));
    assert.ok(ids.has('crypt'));
    let hearths = 0;
    for (const room of controller.rooms) {
      room.scene.traverse((object) => {
        if (object.userData.kind === 'prop.hearth') {
          hearths += 1;
        }
      });
    }
    assert.ok(hearths >= 4);
  });
});
