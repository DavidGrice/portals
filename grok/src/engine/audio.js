export function mixGain(master, bus, muted = false) {
  if (muted) {
    return 0;
  }
  return Math.max(0, Math.min(1, Number(master) || 0)) * Math.max(0, Math.min(1, Number(bus) || 0));
}

const BEDS = {
  halls: { freqs: [65.4, 98.0, 130.8], filter: 320, lfo: 0.07, gain: 0.09 },
  haunt: { freqs: [36.7, 55.0, 73.4, 110], filter: 160, lfo: 0.045, gain: 0.11, whisper: 740 },
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
  cellar: 'haunt',
  attic: 'haunt',
};

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
    const spec = BEDS[ROOM_BED[id] ?? (room?.tags?.includes('haunt') ? 'haunt' : 'halls')];
    const now = this.ctx.currentTime;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = spec.filter;
    filter.Q.value = 0.7;
    filter.connect(this.music);
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = spec.lfo;
    lfoGain.gain.value = spec.filter * 0.35;
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
    if (spec.whisper) {
      const whisper = this.ctx.createOscillator();
      const wGain = this.ctx.createGain();
      whisper.type = 'triangle';
      whisper.frequency.value = spec.whisper;
      wGain.gain.value = 0.012;
      whisper.connect(wGain);
      wGain.connect(filter);
      whisper.start();
      this.bedNodes.push(whisper, wGain);
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

  footstep() {
    this._noise(0.045, 220, 0.1);
  }

  tick(dt, { moving = false, onGround = true } = {}) {
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
}

export const gameAudio = new GameAudio();
