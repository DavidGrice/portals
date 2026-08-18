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

const ROOM_BED = {
  'room-a': 'halls',
  'room-b': 'halls',
  'room-c': 'halls',
  'room-d': 'halls',
  'room-e': 'halls',
  foyer: 'haunt',
  hall: 'haunt',
  parlor: 'haunt',
  dining: 'haunt',
  cellar: 'hauntDeep',
  crypt: 'hauntDeep',
  attic: 'hauntWind',
};

export function bedForRoom(room) {
  const id = room?.id ?? room;
  if (ROOM_BED[id]) {
    return ROOM_BED[id];
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

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.music = null;
    this.sfx = null;
    this.bedNodes = [];
    this.muted = true;
    this.masterVolume = 0.8;
    this.musicVolume = 0.5;
    this.sfxVolume = 0.9;
    this._step = 0.2;
    this._grounded = true;
    this._bedId = null;
    this._hauntWait = 3.5;
    this._crackle = 0.1;
    this._lastHaunt = null;
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
    return true;
  }

  mute() {
    this.muted = true;
    this.applyVolumes();
    this.stopBed();
  }

  applyVolumes(settings = {}) {
    if (settings.masterVolume != null) {
      this.masterVolume = settings.masterVolume;
    }
    if (settings.musicVolume != null) {
      this.musicVolume = settings.musicVolume;
    }
    if (settings.sfxVolume != null) {
      this.sfxVolume = settings.sfxVolume;
    }
    if (!this.ctx || !this.master) {
      return;
    }
    const now = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.masterVolume, now, 0.04);
    this.music.gain.setTargetAtTime(this.musicVolume, now, 0.04);
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
    const spec = BEDS[bedForRoom(room ?? id)];
    const now = this.ctx.currentTime;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = spec.filter;
    filter.Q.value = 0.85;
    filter.connect(this.music);
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = spec.lfo;
    lfoGain.gain.value = spec.filter * 0.4;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();
    this.bedNodes.push(lfo, lfoGain, filter);
    for (const freq of spec.freqs) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.detune.value = (Math.random() - 0.5) * 8;
      gain.gain.value = spec.gain / spec.freqs.length;
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
      subGain.gain.value = spec.gain * 0.7;
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
      wGain.gain.value = 0.014;
      whisper.connect(wGain);
      wGain.connect(filter);
      whisper.start();
      this.bedNodes.push(whisper, wGain);
    }
    if (spec.wind) {
      this._startWind(filter);
    }
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
    this._bedId = null;
  }

  jump() {
    this._tone(180, 90, 0.12, 0.12);
  }

  land() {
    this._noise(0.08, 140, 0.16);
    this._tone(70, 40, 0.1, 0.14);
  }

  whoosh() {
    this._noise(0.28, 240, 0.2, 1800);
  }

  slam() {
    this._noise(0.16, 160, 0.2, 50);
    this._tone(70, 28, 0.22, 0.14);
  }

  click() {
    this._noise(0.04, 1800, 0.08, 400);
    this._tone(420, 180, 0.05, 0.06);
  }

  footstep() {
    this._noise(0.045, 220, 0.1);
  }

  tick(dt, { moving = false, onGround = true, haunt = false, nearFire = false } = {}) {
    if (!this._grounded && onGround) {
      this.land();
    }
    this._grounded = onGround;
    if (moving && onGround) {
      this._step += dt;
      if (this._step >= 0.42) {
        this._step = 0;
        this.footstep();
      }
    } else {
      this._step = 0.28;
    }
    if (haunt) {
      this._hauntWait -= dt;
      if (this._hauntWait <= 0) {
        this._hauntWait = 3.8 + Math.random() * 7.5;
        this.hauntEvent();
      }
    }
    if (nearFire) {
      this._crackle -= dt;
      if (this._crackle <= 0) {
        this._crackle = 0.14 + Math.random() * 0.28;
        this.crackle();
      }
    }
  }

  hauntEvent() {
    const roll = Math.random();
    if (roll < 0.34) {
      this.creak();
    } else if (roll < 0.62) {
      this.whisper();
    } else if (roll < 0.84) {
      this.rumble();
    } else {
      this.knock();
    }
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
    this._lastHaunt = 'rumble';
  }

  knock() {
    this._noise(0.08, 180, 0.14, 70);
    this._tone(90, 50, 0.16, 0.1);
    this._lastHaunt = 'knock';
  }

  crackle() {
    this._noise(0.05, 2400, 0.055, 380);
    this._lastHaunt = 'crackle';
  }

  _ensureGraph() {
    if (!this.ctx || this.master) {
      return;
    }
    this.master = this.ctx.createGain();
    this.music = this.ctx.createGain();
    this.sfx = this.ctx.createGain();
    this.music.connect(this.master);
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
}

export const gameAudio = new GameAudio();
