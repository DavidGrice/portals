import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { clearFeatures, interactFeatures, listFeatures, registerFeature, tickFeatures } from '../src/features/registry.js';
import { getWorldData } from '../src/ui/worlds.js';

describe('feature registry', () => {
  it('ticks a registered feature once per call and can handle a pad action', () => {
    clearFeatures();
    let ticks = 0;
    registerFeature({
      id: 'watch',
      tick(rooms) {
        ticks += 1;
        return rooms.length;
      },
      onInteract(action) {
        if (action !== 'ping') {
          return undefined;
        }
        return { type: 'ping', ok: true };
      },
    });
    const rooms = [{ id: 'a' }, { id: 'b' }];
    const first = tickFeatures(rooms, {});
    const second = tickFeatures(rooms, {});
    assert.equal(first.watch, 2);
    assert.equal(second.watch, 2);
    assert.equal(ticks, 2);
    assert.deepEqual(interactFeatures('ping', {}), { type: 'ping', ok: true });
    assert.equal(interactFeatures('other', {}), undefined);
    assert.ok(listFeatures().some((feature) => feature.id === 'watch'));
    clearFeatures();
  });

  it('loads a world from the index and rejects an unknown id', () => {
    const littrow = getWorldData('littrow');
    assert.equal(littrow.id, 'littrow');
    assert.equal(littrow.startRoom, 'exhibit');
    assert.throws(() => getWorldData('not-a-world'), /Unknown world/);
  });
});
