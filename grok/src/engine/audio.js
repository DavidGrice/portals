import audioManifest from '../../data/audio.json' with { type: 'json' };
import { resolveMaterial } from '../content/materials.js';

export function mixGain(master, bus, muted = false) {
  if (muted) {
    return 0;
  }
  return Math.max(0, Math.min(1, Number(master) || 0)) * Math.max(0, Math.min(1, Number(bus) || 0));
}

export const BEDS = {
  halls: { freqs: [65.4, 98.0, 130.8], filter: 320, lfo: 0.07, gain: 0.09 },
  haunt: { freqs: [24.5, 32.7, 41.2, 61.7], filter: 95, lfo: 0.028, gain: 0.125, whisper: 580, sub: 18.35 },
  hauntDeep: { freqs: [18.35, 24.5, 30.87, 36.7], filter: 68, lfo: 0.02, gain: 0.14, whisper: 410, sub: 14.5 },
  hauntWind: { freqs: [27.5, 41.2, 82.4], filter: 210, lfo: 0.055, gain: 0.1, whisper: 980, sub: 22, wind: true },
  cyber: { freqs: [40, 80, 160, 320], filter: 420, lfo: 0.11, gain: 0.08, whisper: 1280, sub: 40 },
  agesPast: { freqs: [38, 57, 76], filter: 180, lfo: 0.035, gain: 0.1, sub: 22 },
  agesFuture: { freqs: [48, 96, 192], filter: 360, lfo: 0.08, gain: 0.09, whisper: 880, sub: 24 },
  agesPrimordial: { freqs: [22, 33, 44], filter: 90, lfo: 0.02, gain: 0.12, sub: 14, whisper: 180 },
  agesIndustrial: { freqs: [55, 82, 110], filter: 240, lfo: 0.07, gain: 0.1, whisper: 300, sub: 28 },
};

const ROOM_BED = audioManifest.rooms ?? {};

export function getAudioManifest(manifest = audioManifest) {
  return manifest;
}

export function bedForRoom(room, manifest = audioManifest) {
  const id = room?.id ?? room;
  const rooms = manifest?.rooms ?? ROOM_BED;
  if (rooms[id]) {
    return rooms[id];
  }
  const tags = room?.tags ?? [];
  if (tags.includes('cyber')) {
    return 'cyber';
  }
  if (tags.includes('industrial')) {
    return 'agesIndustrial';
  }
  if (id === 'primordial' || tags.includes('primordial')) {
    return 'agesPrimordial';
  }
  if (tags.includes('future')) {
    return 'agesFuture';
  }
  if (tags.includes('ages') || tags.includes('prehistoric')) {
    return 'agesPast';
  }
  return tags.includes('haunt') ? 'haunt' : 'halls';
}

export function doorTheme(room) {
  const tags = room?.tags ?? [];
  if (tags.includes('haunt')) {
    return 'haunt';
  }
  if (tags.includes('cyber')) {
    return 'cyber';
  }
  if (tags.includes('ages') || tags.includes('prehistoric') || tags.includes('future')) {
    return 'ages';
  }
  return 'default';
}

export function doorVocab(theme, kind = 'whoosh', manifest = audioManifest) {
  const doors = manifest?.doors ?? {};
  return doors[theme]?.[kind] ?? doors.default?.[kind] ?? kind;
}

export function surfaceForRoom(room, library) {
  if (!room) {
    return 'stone';
  }
  if (room.surface) {
    return room.surface;
  }
  let found = null;
  room.scene?.traverse((object) => {
    if (object.userData?.kind !== 'env.floor') {
      return;
    }
    found = object.userData.surface
      ?? resolveMaterial(object.userData.materialId, { library })?.surface
      ?? found;
  });
  return found ?? inferSurfaceFromTags(room.tags ?? []);
}

function inferSurfaceFromTags(tags) {
  if (tags.includes('cyber')) {
    return 'metal';
  }
  if (tags.includes('prehistoric')) {
    return 'dirt';
  }
  if (tags.includes('haunt')) {
    return 'wood';
  }
  return 'stone';
}

export function clipForSurface(surface, manifest = audioManifest) {
  const spec = manifest?.surfaces?.[surface] ?? manifest?.surfaces?.stone;
  return spec ?? { clip: 'step-stone', rate: 0.42 };
}

export function eventAllowed(event, { tags = [], roomId = null } = {}) {
  if (!event) {
    return false;
  }
  if (event.excludeTags?.some((tag) => tags.includes(tag))) {
    return false;
  }
  if (event.tags?.length && !event.tags.some((tag) => tags.includes(tag))) {
    return false;
  }
  if (event.rooms?.length && !event.rooms.includes(roomId)) {
    return false;
  }
  return true;
}

export function pickHauntEvent(tags, roomId, manifest = audioManifest, roll = Math.random()) {
  const allowed = (manifest?.events ?? []).filter((event) => eventAllowed(event, { tags, roomId }));
  if (!allowed.length) {
    return null;
  }
  const total = allowed.reduce((sum, event) => sum + (event.weight ?? 1), 0);
  let cursor = roll * total;
  for (const event of allowed) {
    cursor -= event.weight ?? 1;
    if (cursor <= 0) {
      return event;
    }
  }
  return allowed[allowed.length - 1];
}

export function fireAttenuation(distance, maxDistance = 7.5) {
  if (!Number.isFinite(distance) || distance >= maxDistance) {
    return 0;
  }
  return Math.max(0, 1 - distance / maxDistance);
}

export function duckTarget(musicVolume, spec = audioManifest.duck) {
  return Math.max(0, Number(musicVolume) || 0) * Math.max(0, spec?.gain ?? 0.22);
}

export class GameAudio {
  constructor(manifest = audioManifest) {
    this.manifest = manifest;
    this.ctx = null;
    this.master = null;
    this.music = null;
    this.ambience = null;
    this.sfx = null;
    this.bedNodes = [];
    this.muted = true;
    this.masterVolume = 0.8;
    this.musicVolume = 0.5;
    this.ambienceVolume = 0.55;
    this.sfxVolume = 0.9;
    this._step = 0.2;
    this._grounded = true;
    this._bedId = null;
    this._hauntWait = 3.5;
    this._crackle = 0.1;
    this._lastHaunt = null;
    this._lastDoor = null;
    this._lastSurface = null;
    this._lastClip = null;
    this._duckUntil = 0;
    this._fireNodes = [];
    this._oneshots = [];
    this.buffers = new Map();
    this._hydrated = false;
    this._failed = new Set();
  }

  async resume() {
    const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctx) {
      return false;
    }
    this.ctx ??= new Ctx();
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }
    this._ensureGraph();
    this.muted = false;
    this.applyVolumes();
    this.hydrate().catch(() => {});
    return true;
  }

  async hydrate() {
    if (!this.ctx || this._hydrated) {
      return this.buffers.size;
    }
    this._hydrated = true;
    const clips = Object.entries(this.manifest?.clips ?? {});
    await Promise.all(clips.map(([id, clip]) => this._loadClip(id, clip)));
    return this.buffers.size;
  }

  mute() {
    this.muted = true;
    this.applyVolumes();
    this.stopBed();
    this._stopFire();
    this._stopOneshots();
  }

  applyVolumes(settings = {}) {
    if (settings.masterVolume != null) {
      this.masterVolume = settings.masterVolume;
    }
    if (settings.musicVolume != null) {
      this.musicVolume = settings.musicVolume;
    }
    if (settings.ambienceVolume != null) {
      this.ambienceVolume = settings.ambienceVolume;
    }
    if (settings.sfxVolume != null) {
      this.sfxVolume = settings.sfxVolume;
    }
    if (!this.ctx || !this.master) {
      return;
    }
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.masterVolume, now, 0.04);
    if (this._duckUntil <= now) {
      this.music.gain.setTargetAtTime(this.musicVolume, now, 0.04);
    }
    this.ambience.gain.setTargetAtTime(this.ambienceVolume, now, 0.04);
    this.sfx.gain.setTargetAtTime(this.sfxVolume, now, 0.04);
  }

  startBed(room) {
    const id = room?.id ?? room;
    if (!this.ctx || this.muted || id === this._bedId) {
      this._bedId = id;
      return;
    }
    this.stopBed();
    this._ensureGraph();
    const bedId = bedForRoom(room ?? id, this.manifest);
    const bed = this.manifest?.beds?.[bedId] ?? {};
    const spec = BEDS[bed.synth ?? bedId] ?? BEDS.halls;
    const now = this.ctx.currentTime;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = spec.filter;
    filter.Q.value = 0.85;
    filter.connect(this.music);
    this._bedFilter = filter;
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = spec.lfo;
    lfoGain.gain.value = spec.filter * 0.4;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
    this.bedNodes.push(lfo, lfoGain, filter);
    const underlay = bed.underlay ?? 0.4;
    for (const freq of spec.freqs) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.detune.value = (Math.random() - 0.5) * 8;
      gain.gain.value = (spec.gain / spec.freqs.length) * underlay;
      osc.connect(gain);
      gain.connect(filter);
      osc.start();
      this.bedNodes.push(osc, gain);
    }
    if (spec.sub) {
      const sub = this.ctx.createOscillator();
      const subGain = this.ctx.createGain();
      sub.type = 'sine';
      sub.frequency.value = spec.sub;
      subGain.gain.value = spec.gain * 0.7 * underlay;
      sub.connect(subGain);
      subGain.connect(filter);
      sub.start();
      this.bedNodes.push(sub, subGain);
    }
    if (spec.whisper) {
      const whisper = this.ctx.createOscillator();
      const wGain = this.ctx.createGain();
      whisper.type = 'triangle';
      whisper.frequency.value = spec.whisper;
      wGain.gain.value = 0.014 * underlay;
      whisper.connect(wGain);
      wGain.connect(filter);
      whisper.start();
      this.bedNodes.push(whisper, wGain);
    }
    if (spec.wind) {
      this._startWind(filter);
    }
    this.playClip(bed.clip, { loop: true, bus: 'music', gain: this.manifest?.clips?.[bed.clip]?.gain ?? 0.6 });
    this.music.gain.setValueAtTime(0, now);
    this.music.gain.linearRampToValueAtTime(this.musicVolume, now + 0.7);
    this._bedId = id;
  }

  stopBed() {
    const now = this.ctx?.currentTime ?? 0;
    for (const node of this.bedNodes) {
      try {
        node.stop?.(now + 0.05);
      } catch {
        // already stopped
      }
      try {
        node.disconnect?.();
      } catch {
        // already gone
      }
    }
    this.bedNodes = [];
    this._bedFilter = null;
    this._bedId = null;
  }

  jump() {
    this._tone(180, 90, 0.12, 0.12);
  }

  land() {
    this._noise(0.08, 140, 0.16);
    this._tone(70, 40, 0.1, 0.14);
  }

  whoosh(theme = 'default') {
    const clip = doorVocab(theme, 'whoosh', this.manifest);
    this._lastDoor = clip;
    if (!this.playClip(clip)) {
      this._noise(0.28, theme === 'cyber' ? 1800 : 240, 0.2, theme === 'haunt' ? 90 : 1800);
    }
  }

  slam(theme = 'default') {
    const clip = doorVocab(theme, 'slam', this.manifest);
    this._lastDoor = clip;
    this.duckMusic();
    if (!this.playClip(clip)) {
      this._noise(0.16, theme === 'haunt' ? 110 : 160, 0.22, 50);
      this._tone(theme === 'haunt' ? 54 : 70, 28, 0.22, 0.14);
    }
  }

  click() {
    if (!this.playClip('click')) {
      this._noise(0.04, 1800, 0.08, 400);
      this._tone(420, 180, 0.05, 0.06);
    }
  }

  unlock() {
    if (!this.playClip(this.manifest?.interact?.unlock ?? 'bolt')) {
      this._noise(0.06, 1400, 0.1, 300);
      this._tone(380, 140, 0.1, 0.09);
    }
  }

  launch() {
    if (!this.playClip(this.manifest?.interact?.launch ?? 'punch')) {
      this._noise(0.1, 400, 0.16, 80);
      this._tone(220, 70, 0.16, 0.16);
    }
  }

  footstep(surface = 'stone') {
    const spec = clipForSurface(surface, this.manifest);
    this._lastSurface = surface;
    if (!this.playClip(spec.clip, { gain: this.manifest?.clips?.[spec.clip]?.gain ?? 0.42 })) {
      const hz = surface === 'metal' || surface === 'grate' ? 900 : surface === 'wood' ? 420 : surface === 'dirt' ? 160 : 220;
      this._noise(0.045, hz, 0.1);
    }
  }

  tick(dt, {
    moving = false,
    onGround = true,
    haunt = false,
    nearFire = false,
    fireDistance = Infinity,
    surface = 'stone',
    tags = haunt ? ['haunt'] : [],
    roomId = null,
    speed = 4,
  } = {}) {
    if (!this._grounded && onGround) {
      this.land();
    }
    this._grounded = onGround;
    const stepRate = clipForSurface(surface, this.manifest).rate ?? 0.42;
    const cadence = Math.max(0.28, stepRate * (4 / Math.max(2, speed)));
    if (moving && onGround) {
      this._step += dt;
      if (this._step >= cadence) {
        this._step = 0;
        this.footstep(surface);
      }
    } else {
      this._step = cadence * 0.66;
    }
    const hauntOn = haunt || (tags.includes('haunt') && !tags.includes('cyber'));
    if (hauntOn) {
      this._hauntWait -= dt;
      if (this._hauntWait <= 0) {
        const event = pickHauntEvent(tags, roomId, this.manifest);
        this._hauntWait = event
          ? event.cooldown[0] + Math.random() * (event.cooldown[1] - event.cooldown[0])
          : 6;
        if (event) {
          this.hauntEvent(event);
        }
      }
    }
    const fireGain = nearFire ? fireAttenuation(Number.isFinite(fireDistance) ? fireDistance : 2.4) : fireAttenuation(fireDistance);
    if (fireGain > 0.04) {
      this._crackle -= dt;
      if (this._crackle <= 0) {
        this._crackle = 0.14 + Math.random() * 0.28;
        this.crackle(fireGain);
      }
      this._filterBedForFire(fireGain);
    } else {
      this._stopFire();
      this._filterBedForFire(0);
    }
  }

  hauntEvent(event = null) {
    const tags = event?.tags ?? ['haunt'];
    const chosen = event ?? pickHauntEvent(tags, null, this.manifest) ?? { id: 'creak', synth: 'creak' };
    this._lastHaunt = chosen.id;
    if (this.playClip(chosen.clip)) {
      return chosen.id;
    }
    if (chosen.synth === 'whisper' || chosen.id === 'whisper') {
      this.whisper();
    } else if (chosen.synth === 'rumble' || chosen.id === 'note') {
      this.rumble();
    } else if (chosen.synth === 'knock' || chosen.id === 'shutter') {
      this.knock();
    } else if (chosen.synth === 'drip' || chosen.id === 'drip') {
      this.drip();
    } else {
      this.creak();
    }
    this._lastHaunt = chosen.id;
    return chosen.id;
  }

  creak() {
    const from = 190 + Math.random() * 120;
    this._tone(from, from * 0.45, 0.7, 0.075);
    this._noise(0.45, 380, 0.07, 70);
    this._lastHaunt = 'creak';
  }

  whisper() {
    this._noise(1.05, 2100, 0.04, 320);
    this._tone(620 + Math.random() * 80, 540, 0.85, 0.018);
    this._lastHaunt = 'whisper';
  }

  rumble() {
    this._tone(34, 18, 1.6, 0.11);
    this._noise(1.2, 90, 0.13, 28);
    this._lastHaunt = 'note';
  }

  knock() {
    this._noise(0.08, 180, 0.14, 70);
    this._tone(90, 50, 0.16, 0.1);
    this._lastHaunt = 'shutter';
  }

  drip() {
    this._tone(980, 420, 0.14, 0.06);
    this._noise(0.08, 2400, 0.04, 600);
    this._lastHaunt = 'drip';
  }

  crackle(gain = 0.55) {
    const peak = 0.055 * Math.max(0.12, Math.min(1, gain));
    if (!this.playClip('fire-crackle', { bus: 'ambience', gain: peak * 4 })) {
      this._noise(0.05, 2400, peak, 380);
    }
    this._lastHaunt = 'crackle';
  }

  duckMusic(spec = this.manifest?.duck) {
    if (!this.ctx || !this.music) {
      this._duckUntil = 1;
      return;
    }
    const now = this.ctx.currentTime;
    const hold = spec?.hold ?? 0.38;
    const release = spec?.release ?? 0.72;
    this._duckUntil = now + hold + release;
    this.music.gain.cancelScheduledValues(now);
    this.music.gain.setTargetAtTime(duckTarget(this.musicVolume, spec), now, spec?.attack ?? 0.05);
    this.music.gain.setTargetAtTime(this.musicVolume, now + hold, release);
  }

  playClip(id, { bus, gain, loop = false } = {}) {
    if (!id || !this.ctx || this.muted) {
      return false;
    }
    const clip = this.manifest?.clips?.[id];
    const buffer = this.buffers.get(id);
    if (!buffer) {
      return false;
    }
    this._ensureGraph();
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = loop || Boolean(clip?.loop);
    const amp = this.ctx.createGain();
    amp.gain.value = gain ?? clip?.gain ?? 1;
    src.connect(amp);
    amp.connect(this._bus(bus ?? clip?.bus ?? 'sfx'));
    src.start();
    this._lastClip = id;
    if (src.loop) {
      this.bedNodes.push(src, amp);
    } else {
      this._oneshots.push(src, amp);
    }
    return true;
  }

  _bus(name) {
    if (name === 'music') {
      return this.music;
    }
    if (name === 'ambience') {
      return this.ambience;
    }
    if (name === 'master') {
      return this.master;
    }
    return this.sfx;
  }

  async _loadClip(id, clip) {
    if (!this.ctx || !clip?.url || this.buffers.has(id) || this._failed.has(id)) {
      return;
    }
    if (typeof fetch !== 'function') {
      this._failed.add(id);
      return;
    }
    try {
      const response = await fetch(clip.url);
      if (!response.ok) {
        this._failed.add(id);
        return;
      }
      const raw = await response.arrayBuffer();
      const buffer = await this.ctx.decodeAudioData(raw.slice(0));
      this.buffers.set(id, buffer);
    } catch {
      this._failed.add(id);
    }
  }

  _ensureGraph() {
    if (!this.ctx || this.master) {
      return;
    }
    this.master = this.ctx.createGain();
    this.music = this.ctx.createGain();
    this.ambience = this.ctx.createGain();
    this.sfx = this.ctx.createGain();
    this.music.connect(this.master);
    this.ambience.connect(this.master);
    this.sfx.connect(this.master);
    this.master.connect(this.ctx.destination);
  }

  _tone(from, to, duration, peak) {
    if (!this.ctx || this.muted) {
      return;
    }
    this._ensureGraph();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), now + duration);
    gain.gain.setValueAtTime(peak, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(this.sfx);
    osc.start(now);
    osc.stop(now + duration + 0.02);
    this._oneshots.push(osc, gain);
  }

  _noise(duration, startHz, peak, endHz = 80) {
    if (!this.ctx || this.muted) {
      return;
    }
    this._ensureGraph();
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const now = this.ctx.currentTime;
    filter.frequency.setValueAtTime(startHz, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(endHz, 40), now + duration);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(peak, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfx);
    src.start(now);
    this._oneshots.push(src, filter, gain);
  }

  _startWind(destination) {
    const length = Math.max(1, Math.floor(this.ctx.sampleRate * 2.2));
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 640;
    filter.Q.value = 0.6;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.03;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    src.start();
    this.bedNodes.push(src, filter, gain);
  }

  _filterBedForFire(amount) {
    if (!this._bedFilter) {
      return;
    }
    const base = BEDS[bedForRoom(this._bedId, this.manifest)]?.filter ?? 220;
    const target = base * (1 - amount * 0.45);
    this._bedFilter.frequency.setTargetAtTime(target, this.ctx?.currentTime ?? 0, 0.2);
  }

  _stopFire() {
    this._stopNodes(this._fireNodes);
    this._fireNodes = [];
  }

  _stopOneshots() {
    this._stopNodes(this._oneshots);
    this._oneshots = [];
  }

  _stopNodes(nodes) {
    const now = this.ctx?.currentTime ?? 0;
    for (const node of nodes) {
      try {
        node.stop?.(now);
      } catch {
        // already stopped
      }
      try {
        node.disconnect?.();
      } catch {
        // already gone
      }
    }
  }
}

export const gameAudio = new GameAudio();
