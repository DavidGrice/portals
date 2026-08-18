import * as THREE from 'three';
import world from '../data/worlds/two-rooms.json';
import catalog from '../data/catalog.json';
import { GraphicsSettings, probeCapabilities } from './engine/index.js';
import { applyLook } from './engine/look.js';
import { emptyPadButtons, firstGamepad, readGamepad } from './engine/gamepad.js';
import { findInteract, runInteract } from './engine/interact.js';
import { nearestFireDistance, spawnCrossBurst, tickAtmosphere } from './engine/atmosphere.js';
import { gameAudio } from './engine/audio.js';
import { tickDestStrip, tickScreens } from './engine/index.js';
import { evictBehind, kitsForDepth, sealArrival, spawnLookahead } from './content/drift.js';
import { tickMaterials } from './content/materials.js';
import { createSession } from './game/session.js';
import { loadSave, poseFromSession, writeSave } from './content/save.js';
import { bindOptions, refreshHud } from './ui/options.js';
import { bindWorldSelect, getWorldData } from './ui/worlds.js';
import { applyTouchMove, bindTouchControls, consumeTouchInteract, consumeTouchJump, consumeTouchLook, createTouchState, detectTouch } from './ui/touch.js';

export const APP_STATES = {
  menu: 'menu',
  loading: 'loading',
  playing: 'playing',
  paused: 'paused',
};

export function createApp({
  settings = GraphicsSettings.load(),
  worldData = world,
  catalogData = catalog,
  createSessionFn = createSession,
} = {}) {
  const params = new URLSearchParams(globalThis.location?.search ?? '');
  const skipHud = params.has('nohud');
  const debugFromUrl = params.has('debug');
  const isTouch = detectTouch();
  const touch = createTouchState();
  const lookHeld = { left: false, right: false, up: false, down: false };
  const keys = { forward: 0, back: 0, left: 0, right: 0 };
  const move = { forward: 0, back: 0, left: 0, right: 0 };
  let padButtons = emptyPadButtons();
  const clock = new THREE.Clock();
  const debugLocal = new THREE.Vector3();

  let state = APP_STATES.menu;
  let session = null;
  let raf = 0;
  let lastCross = '—';
  let fpsFrames = 0;
  let fpsAcc = 0;
  let unbindSession = () => {};
  let selectedWorldId = worldData?.id ?? 'two-rooms';
  let nearbyInteract = null;

  const welcome = document.getElementById('welcome');
  const home = document.getElementById('welcome-home');
  const loading = document.getElementById('welcome-loading');
  const pauseCard = document.getElementById('welcome-pause');
  const helpCard = document.getElementById('welcome-help');
  const worldsCard = document.getElementById('welcome-worlds');
  const playButton = document.getElementById('welcome-enter');
  const fpsNode = document.getElementById('fps');
  const deskPause = document.getElementById('desk-pause');
  const debugPanel = document.getElementById('debug');
  const destStrip = document.getElementById('dest-strip');
  const loadingStatus = document.getElementById('welcome-loading-status');

  const options = bindOptions({
    settings,
    getSession: () => session,
    onClose: () => {
      showMenuCard(state === APP_STATES.paused ? 'pause' : 'home');
    },
    onRebuild: () => {
      if (session) {
        quitToMenu();
        play();
      }
    },
  });

  const touchHud = bindTouchControls({
    hud: document.getElementById('touch-hud'),
    state: touch,
    onJump: () => {
      if (state === APP_STATES.playing) {
        doJump();
      }
    },
    onPause: pause,
    onInteract: tryInteract,
  });

  refreshHud(settings);
  if (playButton) {
    playButton.textContent = 'Play';
  }

  probeCapabilities().then((capabilities) => {
    document.documentElement.dataset.portalBackend = capabilities.portalBackend;
    document.documentElement.dataset.webgpu = capabilities.webgpu ? 'yes' : 'no';
    const gpuLine = document.getElementById('opt-gpu');
    if (gpuLine) {
      const adapter = capabilities.adapterLabel ? ` · ${capabilities.adapterLabel}` : '';
      gpuLine.textContent = `${capabilities.reason}${adapter}`;
    }
    console.info('portals-grok capabilities', capabilities);
  });

  const continueButton = document.getElementById('welcome-continue');
  refreshContinue();
  bindWorldSelect({
    root: worldsCard,
    onPick: (id) => {
      selectedWorldId = id;
      play({ worldId: id });
    },
    onBack: () => showMenuCard('home'),
  });
  playButton?.addEventListener('click', () => showMenuCard('worlds'));
  continueButton?.addEventListener('click', () => play({ useSave: true }));
  document.getElementById('welcome-help-open')?.addEventListener('click', () => showMenuCard('help'));
  document.getElementById('welcome-help-back')?.addEventListener('click', () => showMenuCard('home'));
  document.getElementById('pause-resume')?.addEventListener('click', () => resume());
  document.getElementById('pause-options')?.addEventListener('click', () => {
    showMenuCard('home');
    options.open?.();
  });
  document.getElementById('pause-quit')?.addEventListener('click', () => quitToMenu());
  deskPause?.addEventListener('click', pause);

  window.addEventListener('mousemove', (event) => {
    if (state !== APP_STATES.playing || !session?.controls.isLocked) {
      return;
    }
    applyLook(session.camera, event.movementX, event.movementY, settings);
  });

  window.addEventListener('keydown', (event) => {
    if (options.isOpen?.() && event.code === 'Escape') {
      options.close?.();
      return;
    }
    if (event.code === 'Enter' && state === APP_STATES.menu && !options.isOpen?.()) {
      if (worldsCard && !worldsCard.hidden) {
        play({ worldId: selectedWorldId });
      } else {
        showMenuCard('worlds');
      }
      return;
    }
    if (event.code === 'Escape' && state === APP_STATES.menu && worldsCard && !worldsCard.hidden) {
      showMenuCard('home');
      return;
    }
    if (event.code === 'Escape' && state === APP_STATES.playing) {
      pause();
      return;
    }
    if (event.code === 'KeyO' && !options.isOpen?.()) {
      if (state === APP_STATES.playing) {
        pause();
      }
      options.open?.();
      return;
    }
    if (state === APP_STATES.playing) {
      setMove(event.code, true);
    }
    if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'ArrowDown') {
      event.preventDefault();
    }
  });

  window.addEventListener('keyup', (event) => {
    setMove(event.code, false);
  });

  window.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state === APP_STATES.playing) {
      pause();
    }
  });

  document.addEventListener('fullscreenchange', () => {
    settings.fullscreen = Boolean(document.fullscreenElement);
    settings.save();
    const select = document.getElementById('opt-fullscreen');
    if (select) {
      select.value = settings.fullscreen ? 'on' : 'off';
    }
  });

  const menuPadTimer = globalThis.setInterval(() => {
    if (state === APP_STATES.playing) {
      return;
    }
    const pad = pollPad();
    if (state === APP_STATES.menu && pad.start) {
      if (worldsCard && !worldsCard.hidden) {
        play({ worldId: selectedWorldId });
      } else {
        showMenuCard('worlds');
      }
    } else if (state === APP_STATES.paused && pad.start) {
      resume();
    }
  }, 50);

  window.addEventListener('resize', () => {
    if (!session) {
      return;
    }
    session.controller.setSize(window.innerWidth, window.innerHeight);
    session.postAA.setSize(window.innerWidth, window.innerHeight, session.renderer.getPixelRatio?.() ?? 1);
  });

  function showMenuCard(which) {
    if (home) {
      home.hidden = which !== 'home';
    }
    if (loading) {
      loading.hidden = which !== 'loading';
    }
    if (pauseCard) {
      pauseCard.hidden = which !== 'pause';
    }
    if (helpCard) {
      helpCard.hidden = which !== 'help';
    }
    if (worldsCard) {
      worldsCard.hidden = which !== 'worlds';
    }
  }

  function setMenuVisible(visible) {
    if (welcome) {
      welcome.hidden = !visible;
    }
  }

  function setHudVisible(visible) {
    touchHud.setVisible(visible && isTouch);
    if (!visible) {
      nearbyInteract = null;
      updateInteractHud();
    }
    if (deskPause) {
      deskPause.hidden = !(visible && !isTouch);
    }
    const crosshair = document.getElementById('crosshair');
    if (crosshair && !settings.showCrosshair) {
      crosshair.hidden = true;
    }
  }

  function setLoading(message) {
    state = APP_STATES.loading;
    setMenuVisible(true);
    showMenuCard('loading');
    if (loadingStatus) {
      loadingStatus.textContent = message;
    }
  }

  async function play({ useSave = false, worldId = selectedWorldId } = {}) {
    if (state === APP_STATES.loading || state === APP_STATES.playing) {
      return state;
    }
    if (state === APP_STATES.paused && session) {
      return resume();
    }

    setLoading('Creating GPU context…');
    await gameAudio.resume();
    gameAudio.applyVolumes(settings);
    await frame();
    try {
      setLoading('Loading halls…');
      selectedWorldId = worldId || selectedWorldId;
      const save = useSave ? loadSave() : null;
      const chosen = save && useSave ? save.worldId : selectedWorldId;
      selectedWorldId = chosen || selectedWorldId;
      session = createSessionFn({
        settings,
        world: getWorldData(selectedWorldId) ?? worldData,
        catalog: catalogData,
        pose: save && save.worldId === selectedWorldId ? save : null,
        width: window.innerWidth,
        height: window.innerHeight,
      });
      bindLiveSession(session);
      gameAudio.startBed(session.controller.currentRoom);
      showRoomTitle(session.controller.currentRoom?.title);
      state = APP_STATES.playing;
      setMenuVisible(false);
      showMenuCard('home');
      setHudVisible(true);
      if (!isTouch) {
        session.controls.lock();
      }
      clock.getDelta();
      loop();
    } catch (error) {
      console.error(error);
      setLoading('Could not start the halls. Check the console.');
      quitToMenu();
    }
    return state;
  }

  function pause() {
    if (state !== APP_STATES.playing) {
      return state;
    }
    state = APP_STATES.paused;
    gameAudio.mute();
    clearInput();
    setHudVisible(false);
    try {
      session?.controls.unlock();
    } catch {
      // already unlocked
    }
    if (!skipHud) {
      setMenuVisible(true);
      showMenuCard('pause');
    }
    return state;
  }

  function resume() {
    if (state !== APP_STATES.paused || !session) {
      return state;
    }
    state = APP_STATES.playing;
    gameAudio.resume().then(() => {
      gameAudio.applyVolumes(settings);
      gameAudio.startBed(session.controller.currentRoom);
    });
    setMenuVisible(false);
    showMenuCard('home');
    setHudVisible(true);
    if (!isTouch) {
      session.controls.lock();
    }
    return state;
  }

  function quitToMenu() {
    if (session) {
      writeSave(poseFromSession(session, selectedWorldId));
    }
    gameAudio.mute();
    if (destStrip) {
      destStrip.hidden = true;
      destStrip.replaceChildren();
    }
    cancelAnimationFrame(raf);
    raf = 0;
    unbindSession();
    session?.dispose();
    session = null;
    state = APP_STATES.menu;
    clearInput();
    setHudVisible(false);
    setMenuVisible(true);
    showMenuCard('home');
    refreshContinue();
    return state;
  }

  function refreshContinue() {
    const save = loadSave();
    if (continueButton) {
      continueButton.hidden = !save;
    }
  }

  function tryInteract() {
    if (state !== APP_STATES.playing || !session) {
      return false;
    }
    const target = nearbyInteract ?? findInteract(session.controller.currentRoom, session.camera.position);
    if (!target) {
      return false;
    }
    const result = runInteract(target, { controller: session.controller });
    if (result?.type === 'launch') {
      session.player.launch(result.impulse);
    }
    nearbyInteract = findInteract(session.controller.currentRoom, session.camera.position);
    updateInteractHud();
    return true;
  }

  function doJump() {
    if (session?.player.jump()) {
      gameAudio.jump();
    }
  }

  function debugEnabled() {
    return debugFromUrl || settings.showDebug;
  }

  function showRoomTitle(title) {
    const banner = document.getElementById('room-banner');
    if (!banner || !title) {
      return;
    }
    banner.textContent = title;
    banner.hidden = false;
    window.clearTimeout(showRoomTitle._timer);
    showRoomTitle._timer = window.setTimeout(() => {
      banner.hidden = true;
    }, 1500);
  }

  function interactHint(spec) {
    if (spec?.action === 'unlock') {
      return 'E  Unseal door';
    }
    if (spec?.action === 'launch') {
      return 'E  Jump';
    }
    return spec?.text ? `E  ${spec.text}` : 'E  Look';
  }

  function updateInteractHud() {
    const hintNode = document.getElementById('interact-hint');
    const visible = Boolean(nearbyInteract);
    if (hintNode) {
      hintNode.hidden = !visible;
      if (visible) {
        hintNode.textContent = interactHint(nearbyInteract.spec);
      }
    }
    touchHud.setInteractVisible?.(visible && state === APP_STATES.playing);
  }

  function bindLiveSession(next) {
    unbindSession();
    const offEnter = next.controller.on('room:enter', ({ room, roomId }) => {
      gameAudio.startBed(room ?? roomId);
      showRoomTitle(room?.title || roomId);
      if (next.controller.drift) {
        const depth = room.depth ?? next.controller.drift.depth ?? 0;
        next.controller.drift.depth = depth;
        spawnLookahead(next.controller, {
          catalog: catalogData,
          kits: kitsForDepth(depth + 1),
          seed: next.controller.drift.seed,
          depth,
          room,
        });
        evictBehind(next.controller);
        const banner = document.getElementById('room-banner');
        if (banner) {
          banner.textContent = `${room?.title || roomId} · ${depth} · ${next.controller.drift.seed}`;
        }
      }
      if (next.gadgets && next.renderer) {
        tickScreens(next.gadgets, { controller: next.controller, renderer: next.renderer, force: true });
      }
      if (debugEnabled()) {
        updateDebug(roomId);
      }
    });
    const offCross = next.controller.on('portal:cross', ({ portal, portalId, from, to }) => {
      lastCross = `${from} → ${to} via ${portalId ?? '?'}`;
      if (next.controller.currentRoom?.tags?.includes('generated') || next.controller.drift) {
        if (sealArrival(portal ?? next.controller.getPortal(portalId))) {
          gameAudio.slam();
        }
      }
      gameAudio.whoosh();
      const dest = next.controller.rooms.find((entry) => entry.id === to);
      if (dest) {
        spawnCrossBurst(dest, next.camera.position, dest.clearColor);
      }
      if (debugEnabled()) {
        updateDebug(to);
      }
    });
    const onLock = () => {
      if (state === APP_STATES.paused) {
        return;
      }
      setMenuVisible(false);
      state = APP_STATES.playing;
      setHudVisible(true);
    };
    const onUnlock = () => {
      if (isTouch || state !== APP_STATES.playing) {
        return;
      }
      pause();
    };
    next.controls.addEventListener('lock', onLock);
    next.controls.addEventListener('unlock', onUnlock);
    if (debugEnabled() && debugPanel) {
      debugPanel.hidden = false;
      updateDebug(next.controller.currentRoom?.id);
    }
    unbindSession = () => {
      offEnter?.();
      offCross?.();
      next.controls?.removeEventListener('lock', onLock);
      next.controls?.removeEventListener('unlock', onUnlock);
    };
  }

  function loop() {
    raf = requestAnimationFrame(loop);
    if (!session) {
      return;
    }
    const dt = Math.min(clock.getDelta(), 0.05);
    if (state === APP_STATES.playing) {
      move.forward = keys.forward;
      move.back = keys.back;
      move.left = keys.left;
      move.right = keys.right;
      const look = consumeTouchLook(touch);
      applyLook(session.camera, look.dx * 2.2, look.dy * 2.2, settings);
      applyLookKeys(dt);
      applyTouchMove(move, touch);
      const pad = pollPad();
      applyTouchMove(move, { active: true, moveX: pad.moveX, moveY: pad.moveY });
      applyLook(session.camera, pad.lookDX, pad.lookDY, settings);
      if (consumeTouchJump(touch) || pad.jump) {
        doJump();
      }
      if (consumeTouchInteract(touch) || pad.interact) {
        tryInteract();
      }
      if (pad.start) {
        pause();
      }
      session.player.step(dt, move, session.controls, session.controller.currentRoom);
      const moving = Boolean(move.forward || move.back || move.left || move.right);
      const haunt = session.controller.currentRoom?.tags?.includes('haunt');
      gameAudio.tick(dt, {
        moving,
        onGround: session.player.onGround,
        haunt,
        nearFire: haunt && nearestFireDistance(session.controller.currentRoom, session.camera.position) < 6.5,
      });
      nearbyInteract = findInteract(session.controller.currentRoom, session.camera.position);
      updateInteractHud();
      session.controller.update();
    }
    tickAtmosphere(session.controller.rooms, { elapsed: clock.elapsedTime, dt });
    tickMaterials(session.controller.rooms, dt);

    session.postAA.begin();
    session.controller.render();
    session.postAA.end();

    tickScreens(session.gadgets, {
      controller: session.controller,
      renderer: session.renderer,
      dt,
    });
    tickDestStrip(session.gadgets, {
      controller: session.controller,
      renderer: session.renderer,
      root: destStrip,
      enabled: debugEnabled() && state !== APP_STATES.menu,
      dt,
    });

    if (settings.showFps && fpsNode) {
      fpsFrames += 1;
      fpsAcc += dt;
      if (fpsAcc >= 0.4) {
        fpsNode.textContent = String(Math.round(fpsFrames / fpsAcc));
        fpsFrames = 0;
        fpsAcc = 0;
      }
    }
    if (debugEnabled()) {
      updateDebug(session.controller.currentRoom?.id);
    }
  }

  function applyLookKeys(dt) {
    if (!session) {
      return;
    }
    const scale = (1000 / 1.4) * settings.lookKeySpeed * dt;
    const yaw = (Number(lookHeld.left) - Number(lookHeld.right)) * scale;
    const pitch = (Number(lookHeld.up) - Number(lookHeld.down)) * scale;
    applyLook(session.camera, yaw, pitch, settings);
  }

  function updateDebug(roomId) {
    if (!debugPanel || debugPanel.hidden || !session) {
      return;
    }
    let nearest = '—';
    let nearestZ = '—';
    let best = Infinity;
    for (const portal of session.controller.allPortals) {
      debugLocal.copy(session.camera.position);
      portal.worldToLocal(debugLocal);
      if (Math.abs(debugLocal.z) < best) {
        best = Math.abs(debugLocal.z);
        nearest = portal.portalId ?? '?';
        nearestZ = debugLocal.z.toFixed(2);
      }
    }
    const drawn = session.controller.lastDrawInfo.drawn.join(',') || '—';
    const skipped = session.controller.lastDrawInfo.skipped.join(',') || '—';
    debugPanel.textContent = [
      `room  ${roomId ?? '—'}`,
      `near  ${nearest} z=${nearestZ}`,
      `draw  ${drawn}`,
      `skip  ${skipped}`,
      `dest  ${session.controller.lastDrawInfo.destCam ?? '—'}`,
      `clip  ${session.controller.lastDrawInfo.clip ?? 'none'}`,
      `cross ${lastCross}`,
      `y     ${session.camera.position.y.toFixed(2)} ground=${session.player.onGround ? session.player.supportY.toFixed(2) : 'air'}`,
      `gpu   ${document.documentElement.dataset.webgpu ?? '?'} / ${document.documentElement.dataset.portalBackend ?? '?'}`,
    ].join('\n');
  }

  function bindCode(action) {
    return settings.keybinds[action];
  }

  function setMove(code, down) {
    if (code === bindCode('forward')) {
      keys.forward = down ? 1 : 0;
    } else if (code === bindCode('back')) {
      keys.back = down ? 1 : 0;
    } else if (code === bindCode('left')) {
      keys.left = down ? 1 : 0;
    } else if (code === bindCode('right')) {
      keys.right = down ? 1 : 0;
    } else if (code === bindCode('jump')) {
      if (down) {
        doJump();
      }
    } else if (code === bindCode('interact')) {
      if (down) {
        tryInteract();
      }
    } else if (code === bindCode('lookLeft')) {
      lookHeld.left = down;
    } else if (code === bindCode('lookRight')) {
      lookHeld.right = down;
    } else if (code === bindCode('lookUp')) {
      lookHeld.up = down;
    } else if (code === bindCode('lookDown')) {
      lookHeld.down = down;
    }
  }

  function pollPad() {
    const next = readGamepad(firstGamepad(), padButtons, settings);
    padButtons = next.pressed;
    return next;
  }

  function clearInput() {
    keys.forward = keys.back = keys.left = keys.right = 0;
    move.forward = move.back = move.left = move.right = 0;
    lookHeld.left = lookHeld.right = lookHeld.up = lookHeld.down = false;
    padButtons = emptyPadButtons();
  }

  function frame() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => resolve());
    });
  }

  showMenuCard('home');
  setMenuVisible(true);

  if (skipHud) {
    play();
  }

  return {
    get state() {
      return state;
    },
    get session() {
      return session;
    },
    play,
    pause,
    resume,
    quitToMenu,
  };
}

export function boot() {
  return createApp();
}
