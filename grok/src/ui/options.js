import { GRAPHICS_PROFILES, GraphicsSettings } from '../engine/GraphicsSettings.js';

export function bindOptions({ settings, camera, renderer, controller, bootAa }) {
  const home = document.getElementById('welcome-home');
  const panel = document.getElementById('options');
  const openButton = document.getElementById('welcome-options');
  const backButton = document.getElementById('options-back');
  if (!panel || !openButton) {
    return settings;
  }

  const fields = {
    profile: document.getElementById('opt-profile'),
    fov: document.getElementById('opt-fov'),
    fovValue: document.getElementById('opt-fov-value'),
    recursion: document.getElementById('opt-recursion'),
    recursionValue: document.getElementById('opt-recursion-value'),
    scale: document.getElementById('opt-scale'),
    aa: document.getElementById('opt-aa'),
    shadows: document.getElementById('opt-shadows'),
  };

  const sync = (next) => {
    Object.assign(settings, next.toJSON());
    fields.profile.value = settings.profile;
    fields.fov.value = String(settings.fov);
    fields.fovValue.textContent = `${settings.fov}°`;
    fields.recursion.value = String(settings.recursion);
    fields.recursionValue.textContent = String(settings.recursion);
    fields.scale.value = String(settings.pixelRatio);
    fields.aa.checked = settings.aa;
    fields.shadows.checked = settings.shadows;
  };

  const read = () =>
    new GraphicsSettings({
      profile: fields.profile.value,
      fov: Number(fields.fov.value),
      recursion: Number(fields.recursion.value),
      pixelRatio: fields.scale.value === 'device' ? 'device' : Number(fields.scale.value),
      aa: fields.aa.checked,
      shadows: fields.shadows.checked,
    });

  sync(settings);

  fields.profile.addEventListener('change', () => {
    sync(GraphicsSettings.fromProfile(fields.profile.value));
  });
  fields.fov.addEventListener('input', () => {
    fields.fovValue.textContent = `${fields.fov.value}°`;
  });
  fields.recursion.addEventListener('input', () => {
    fields.recursionValue.textContent = fields.recursion.value;
  });

  openButton.addEventListener('click', () => {
    home.hidden = true;
    panel.hidden = false;
  });
  backButton?.addEventListener('click', () => {
    panel.hidden = true;
    home.hidden = false;
    sync(settings);
  });

  panel.addEventListener('submit', (event) => {
    event.preventDefault();
    const next = read();
    next.save();
    Object.assign(settings, next.toJSON());
    next.apply({ camera, renderer, controller });
    if (next.aa !== bootAa) {
      globalThis.location.reload();
      return;
    }
    panel.hidden = true;
    home.hidden = false;
  });

  return settings;
}

export { GRAPHICS_PROFILES };
