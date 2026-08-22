import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { probeCapabilities } from '../src/engine/capabilities.js';
import { assertMultiplayerAllowed, multiplayerStatus } from '../src/net/multiplayer.js';

describe('parked remainder', () => {
  it('never substitutes WebGPU for stencil doors', async () => {
    const caps = await probeCapabilities();
    assert.equal(caps.portalBackend, 'webgl');
    assert.match(caps.reason, /WebGL/);
  });

  it('keeps multiplayer last and refuses Drift hosts', () => {
    const status = multiplayerStatus();
    assert.equal(status.available, false);
    assert.equal(status.parked, true);
    assert.equal(assertMultiplayerAllowed({ id: 'littrow' }), false);
    assert.throws(() => assertMultiplayerAllowed({ id: 'drift', multiplayer: true }), /Drift cannot host multiplayer/);
    assert.throws(() => assertMultiplayerAllowed({ id: 'littrow', multiplayer: true }), /parked last/);
  });
});
