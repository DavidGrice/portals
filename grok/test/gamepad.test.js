import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyDeadzone, emptyPadButtons, GAMEPAD_DEADZONE, readGamepad } from '../src/engine/gamepad.js';
import { GraphicsSettings } from '../src/engine/index.js';

function fakePad({ axes = [0, 0, 0, 0], buttons = [] } = {}) {
  return {
    axes,
    buttons: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((index) => ({
      pressed: Boolean(buttons[index]),
    })),
  };
}

describe('gamepad', () => {
  it('kills stick noise inside the deadzone and remaps the rest', () => {
    assert.equal(applyDeadzone(0), 0);
    assert.equal(applyDeadzone(GAMEPAD_DEADZONE - 0.01), 0);
    assert.ok(applyDeadzone(1) > 0.99);
    assert.ok(applyDeadzone(-0.5) < 0);
  });

  it('edges jump and Start so a held button fires once', () => {
    const pad = fakePad({ buttons: { 0: true, 9: true } });
    const first = readGamepad(pad, emptyPadButtons());
    assert.equal(first.jump, true);
    assert.equal(first.start, true);
    const held = readGamepad(pad, first.pressed);
    assert.equal(held.jump, false);
    assert.equal(held.start, false);
  });

  it('turns left stick up into forward and right stick into look', () => {
    const pad = fakePad({ axes: [0, -1, 0.8, 0] });
    const next = readGamepad(pad, emptyPadButtons(), { gamepadSensitivity: 0.5 });
    assert.ok(next.moveY < -0.9, `moveY ${next.moveY}`);
    assert.ok(next.lookDX > 0, `lookDX ${next.lookDX}`);
  });

  it('stores fullscreen and gamepad sensitivity on the settings object', () => {
    const settings = new GraphicsSettings({ fullscreen: true, gamepadSensitivity: 1.1 });
    assert.equal(settings.fullscreen, true);
    assert.equal(settings.gamepadSensitivity, 1.1);
    const json = settings.toJSON();
    assert.equal(json.fullscreen, true);
    assert.equal(json.gamepadSensitivity, 1.1);
    const debug = new GraphicsSettings({ showDebug: true });
    assert.equal(debug.showDebug, true);
    assert.equal(debug.toJSON().showDebug, true);
  });
});
