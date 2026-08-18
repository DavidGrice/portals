import {
  DEFAULT_KEYBINDS,
  GRAPHICS_PROFILES,
  GraphicsSettings,
  KEYBIND_GROUPS,
} from '../engine/GraphicsSettings.js';
import { AA_MODES, aaModeInfo } from '../engine/aaModes.js';
import { applyFullscreen } from '../engine/gamepad.js';
import { gameAudio } from '../engine/audio.js';

const ANISOTROPY_LEVELS = [
  { value: 1, label: 'Off' },
  { value: 2, label: '2×' },
  { value: 4, label: '4×' },
  { value: 8, label: '8×' },
  { value: 16, label: '16×' },
];

function field(id) {
  return document.getElementById(id);
}

function setText(id, text) {
  const node = field(id);
  if (node) {
    node.textContent = text;
  }
}

function codeLabel(code) {
  if (!code) {
    return 'Unbound';
  }
  return code.replace(/^Key/, '').replace(/^Arrow/, 'Arrow ').replace(/^Digit/, '');
}

export function bindOptions({
  settings,
  getSession = () => null,
  onClose,
  onRebuild,
} = {}) {
  const home = field('welcome-home');
  const panel = field('options');
  const openButton = field('welcome-options');
  const backButton = field('options-back');
  if (!panel || !openButton) {
    return settings;
  }

  let listening = null;

  buildKeybindRows();
  sync(settings);
  bindTabs();

  field('opt-profile')?.addEventListener('change', () => {
    const next = GraphicsSettings.fromProfile(field('opt-profile').value, read());
    commit(next, { persist: false });
    sync(next);
  });

  field('opt-aa')?.addEventListener('change', () => {
    setText('opt-aa-blurb', aaModeInfo(field('opt-aa').value).blurb);
  });

  panel.addEventListener('input', (event) => {
    if (!(event.target instanceof HTMLInputElement)) {
      return;
    }
    if (event.target.id === 'opt-fov') {
      setText('opt-fov-value', `${event.target.value}°`);
    }
    if (event.target.id === 'opt-recursion') {
      setText('opt-recursion-value', event.target.value);
    }
    if (event.target.id === 'opt-view') {
      setText('opt-view-value', `${Math.round(Number(event.target.value) * 100)}%`);
    }
    if (event.target.id === 'opt-mouse') {
      setText('opt-mouse-value', Number(event.target.value).toFixed(2));
    }
    if (event.target.id === 'opt-gamepad') {
      setText('opt-gamepad-value', Number(event.target.value).toFixed(2));
    }
    if (event.target.id === 'opt-move') {
      setText('opt-move-value', Number(event.target.value).toFixed(1));
    }
    if (event.target.id === 'opt-jump') {
      setText('opt-jump-value', Number(event.target.value).toFixed(1));
    }
    if (event.target.id === 'opt-look-keys') {
      setText('opt-look-keys-value', Number(event.target.value).toFixed(1));
    }
    if (event.target.id.startsWith('opt-vol-')) {
      setText(`${event.target.id}-value`, `${Math.round(Number(event.target.value) * 100)}%`);
    }
  });

  openButton.addEventListener('click', () => openOptions());
  backButton?.addEventListener('click', () => closeOptions());

  panel.addEventListener('submit', (event) => {
    event.preventDefault();
    const next = read();
    const previousAa = settings.hardwareAa;
    next.save();
    commit(next, { persist: false });
    if (next.hardwareAa !== previousAa && getSession()) {
      closeOptions();
      onRebuild?.();
      return;
    }
    closeOptions();
  });

  field('opt-reset-keys')?.addEventListener('click', () => {
    const next = read();
    next.keybinds = { ...DEFAULT_KEYBINDS };
    commit(next);
    sync(next);
  });

  function openOptions() {
    if (home) {
      home.hidden = true;
    }
    panel.hidden = false;
    sync(settings);
  }

  function closeOptions() {
    panel.hidden = true;
    if (home) {
      home.hidden = false;
    }
    onClose?.();
  }

  function commit(next, { persist = true } = {}) {
    Object.assign(settings, next.toJSON());
    if (persist) {
      next.save();
    }
    const session = getSession?.();
    if (session) {
      next.apply(session);
    } else {
      refreshHud(settings);
      applyFullscreen(settings.fullscreen);
    }
    gameAudio.applyVolumes(settings);
  }

  function read() {
    return new GraphicsSettings({
      profile: field('opt-profile')?.value,
      aaMode: field('opt-aa')?.value,
      hardwareAa: isOn('opt-hardware-aa'),
      fov: Number(field('opt-fov')?.value),
      recursion: Number(field('opt-recursion')?.value),
      pixelRatio: field('opt-scale')?.value === 'device' ? 'device' : Number(field('opt-scale')?.value),
      shadows: isOn('opt-shadows'),
      fillLight: isOn('opt-fill'),
      anisotropy: Number(field('opt-anisotropy')?.value),
      viewDistance: Number(field('opt-view')?.value),
      mouseSensitivity: Number(field('opt-mouse')?.value),
      gamepadSensitivity: Number(field('opt-gamepad')?.value),
      invertY: isOn('opt-invert'),
      fullscreen: isOn('opt-fullscreen'),
      moveSpeed: Number(field('opt-move')?.value),
      jumpSpeed: Number(field('opt-jump')?.value),
      lookKeySpeed: Number(field('opt-look-keys')?.value),
      masterVolume: Number(field('opt-vol-master')?.value),
      musicVolume: Number(field('opt-vol-music')?.value),
      ambienceVolume: Number(field('opt-vol-ambience')?.value),
      sfxVolume: Number(field('opt-vol-sfx')?.value),
      showFps: isOn('opt-fps'),
      showDebug: isOn('opt-debug'),
      showCrosshair: isOn('opt-crosshair'),
      colorblindMode: isOn('opt-colorblind'),
      keybinds: { ...settings.keybinds },
    });
  }

  function sync(next) {
    setSelect('opt-profile', next.profile);
    setSelect('opt-aa', next.aaMode);
    setSelect('opt-scale', String(next.pixelRatio));
    setSelect('opt-anisotropy', String(next.anisotropy));
    setRange('opt-fov', next.fov, `${next.fov}°`);
    setRange('opt-recursion', next.recursion, String(next.recursion));
    setRange('opt-view', next.viewDistance, `${Math.round(next.viewDistance * 100)}%`);
    setRange('opt-mouse', next.mouseSensitivity, next.mouseSensitivity.toFixed(2));
    setRange('opt-gamepad', next.gamepadSensitivity, next.gamepadSensitivity.toFixed(2));
    setRange('opt-move', next.moveSpeed, next.moveSpeed.toFixed(1));
    setRange('opt-jump', next.jumpSpeed, next.jumpSpeed.toFixed(1));
    setRange('opt-look-keys', next.lookKeySpeed, next.lookKeySpeed.toFixed(1));
    setRange('opt-vol-master', next.masterVolume, `${Math.round(next.masterVolume * 100)}%`);
    setRange('opt-vol-music', next.musicVolume, `${Math.round(next.musicVolume * 100)}%`);
    setRange('opt-vol-ambience', next.ambienceVolume ?? 0.55, `${Math.round((next.ambienceVolume ?? 0.55) * 100)}%`);
    setRange('opt-vol-sfx', next.sfxVolume, `${Math.round(next.sfxVolume * 100)}%`);
    setSelect('opt-hardware-aa', next.hardwareAa ? 'on' : 'off');
    setSelect('opt-shadows', next.shadows ? 'on' : 'off');
    setSelect('opt-fill', next.fillLight ? 'on' : 'off');
    setSelect('opt-invert', next.invertY ? 'on' : 'off');
    setSelect('opt-fps', next.showFps ? 'on' : 'off');
    setSelect('opt-debug', next.showDebug ? 'on' : 'off');
    setSelect('opt-crosshair', next.showCrosshair ? 'on' : 'off');
    setSelect('opt-colorblind', next.colorblindMode ? 'on' : 'off');
    setSelect('opt-fullscreen', next.fullscreen ? 'on' : 'off');
    setText('opt-aa-blurb', aaModeInfo(next.aaMode).blurb);
    setText('opt-profile-blurb', GRAPHICS_PROFILES[next.profile]?.blurb ?? '');
    syncKeybindButtons(next.keybinds);
    refreshHud(next);
  }

  function bindTabs() {
    const tabs = panel.querySelectorAll('[data-opt-tab]');
    const panes = panel.querySelectorAll('[data-opt-pane]');
    for (const tab of tabs) {
      tab.addEventListener('click', () => {
        const id = tab.getAttribute('data-opt-tab');
        for (const button of tabs) {
          button.classList.toggle('on', button === tab);
        }
        for (const pane of panes) {
          pane.hidden = pane.getAttribute('data-opt-pane') !== id;
        }
      });
    }
  }

  function buildKeybindRows() {
    const root = field('opt-keybinds');
    if (!root) {
      return;
    }
    root.replaceChildren();
    for (const group of KEYBIND_GROUPS) {
      const heading = document.createElement('div');
      heading.className = 'options-key-group';
      heading.textContent = group.label;
      root.append(heading);
      for (const action of group.actions) {
        const row = document.createElement('div');
        row.className = 'options-key-row';
        const name = document.createElement('span');
        name.textContent = action.label;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'options-key';
        button.dataset.action = action.id;
        button.addEventListener('click', () => startListen(action.id, button));
        row.append(name, button);
        root.append(row);
      }
    }
  }

  function startListen(actionId, button) {
    listening = actionId;
    button.classList.add('listening');
    button.textContent = 'Press a key';
    const onKey = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.code !== 'Escape') {
        settings.keybinds = { ...settings.keybinds, [actionId]: event.code };
        settings.save?.();
      }
      listening = null;
      window.removeEventListener('keydown', onKey, true);
      syncKeybindButtons(settings.keybinds);
    };
    window.addEventListener('keydown', onKey, true);
  }

  function syncKeybindButtons(keybinds) {
    for (const button of panel.querySelectorAll('.options-key')) {
      const action = button.dataset.action;
      button.classList.toggle('listening', listening === action);
      button.textContent = listening === action ? 'Press a key' : codeLabel(keybinds[action]);
    }
  }

  return {
    settings,
    open: openOptions,
    close: closeOptions,
    isOpen: () => !panel.hidden,
  };
}

export function refreshHud(settings) {
  const fps = field('fps');
  const crosshair = field('crosshair');
  const debug = field('debug');
  if (fps) {
    fps.hidden = !settings.showFps;
  }
  if (crosshair) {
    crosshair.hidden = !settings.showCrosshair;
  }
  if (debug) {
    const forced = new URLSearchParams(globalThis.location?.search ?? '').has('debug');
    debug.hidden = !(settings.showDebug || forced);
  }
  const destStrip = field('dest-strip');
  if (destStrip && !(settings.showDebug || new URLSearchParams(globalThis.location?.search ?? '').has('debug'))) {
    destStrip.hidden = true;
  }
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.colorblind = settings.colorblindMode ? 'on' : 'off';
  }
}

function setSelect(id, value) {
  const node = field(id);
  if (node) {
    node.value = String(value);
  }
}

function setRange(id, value, label) {
  const node = field(id);
  if (node) {
    node.value = String(value);
  }
  setText(`${id}-value`, label);
}

function isOn(id) {
  return field(id)?.value === 'on';
}

export { GRAPHICS_PROFILES, AA_MODES };
