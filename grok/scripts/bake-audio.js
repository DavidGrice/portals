import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'assets', 'audio');
const RATE = 22050;

function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function clamp(value, min = -1, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function writeWav(samples, sampleRate = RATE) {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i += 1) {
    const sample = clamp(samples[i]);
    buf.writeInt16LE(sample < 0 ? sample * 0x8000 : sample * 0x7fff, 44 + i * 2);
  }
  return buf;
}

function alloc(seconds) {
  return new Float32Array(Math.max(1, Math.floor(RATE * seconds)));
}

function mixInto(target, source, gain = 1, offset = 0) {
  for (let i = 0; i < source.length && i + offset < target.length; i += 1) {
    target[i + offset] += source[i] * gain;
  }
}

function sine(seconds, freq, { gain = 0.2, attack = 0.02, release = 0.08, detune = 0, phase = 0 } = {}) {
  const out = alloc(seconds);
  const omega = ((freq * (1 + detune)) * 2 * Math.PI) / RATE;
  const a = Math.floor(attack * RATE);
  const r = Math.floor(release * RATE);
  for (let i = 0; i < out.length; i += 1) {
    let env = 1;
    if (i < a) {
      env = i / Math.max(1, a);
    } else if (i > out.length - r) {
      env = (out.length - i) / Math.max(1, r);
    }
    out[i] = Math.sin(phase + omega * i) * gain * env;
  }
  return out;
}

function noise(seconds, { gain = 0.2, decay = true, rand = Math.random } = {}) {
  const out = alloc(seconds);
  for (let i = 0; i < out.length; i += 1) {
    const env = decay ? 1 - i / out.length : 1;
    out[i] = (rand() * 2 - 1) * gain * env;
  }
  return out;
}

function lowpass(samples, cutoff, resonance = 0.2) {
  const out = new Float32Array(samples.length);
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / RATE;
  const a = dt / (rc + dt);
  let prev = 0;
  for (let i = 0; i < samples.length; i += 1) {
    prev += a * (samples[i] - prev);
    out[i] = prev + (samples[i] - prev) * resonance * 0.15;
  }
  return out;
}

function highpass(samples, cutoff) {
  const out = new Float32Array(samples.length);
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / RATE;
  const a = rc / (rc + dt);
  let prevIn = 0;
  let prevOut = 0;
  for (let i = 0; i < samples.length; i += 1) {
    prevOut = a * (prevOut + samples[i] - prevIn);
    prevIn = samples[i];
    out[i] = prevOut;
  }
  return out;
}

function normalize(samples, peak = 0.92) {
  let max = 0.0001;
  for (const sample of samples) {
    max = Math.max(max, Math.abs(sample));
  }
  const scale = peak / max;
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] *= scale;
  }
  return samples;
}

function bed({ freqs, filter, gain, sub, whisper, wind, seed }) {
  const rand = seeded(seed);
  const seconds = 2.4;
  const out = alloc(seconds);
  for (const freq of freqs) {
    mixInto(out, sine(seconds, freq, {
      gain: gain / freqs.length,
      attack: 0.08,
      release: 0.08,
      detune: (rand() - 0.5) * 0.012,
    }));
  }
  if (sub) {
    mixInto(out, sine(seconds, sub, { gain: gain * 0.7, attack: 0.12, release: 0.12 }));
  }
  if (whisper) {
    mixInto(out, sine(seconds, whisper, { gain: 0.03, attack: 0.2, release: 0.2 }));
  }
  if (wind) {
    mixInto(out, lowpass(noise(seconds, { gain: 0.18, decay: false, rand }), 640), 0.55);
  }
  return normalize(lowpass(out, filter, 0.12), 0.78);
}

function oneshotToneNoise({ from, to, seconds, peak, noiseHz, noisePeak, seed }) {
  const rand = seeded(seed);
  const out = alloc(seconds);
  mixInto(out, sine(seconds, from, { gain: peak, attack: 0.008, release: seconds * 0.7 }));
  if (to && to !== from) {
    const sweep = alloc(seconds);
    for (let i = 0; i < sweep.length; i += 1) {
      const t = i / sweep.length;
      const freq = from + (to - from) * t;
      sweep[i] = Math.sin((freq * 2 * Math.PI * i) / RATE) * peak * (1 - t);
    }
    mixInto(out, sweep, 0.7);
  }
  if (noisePeak) {
    mixInto(out, lowpass(noise(seconds, { gain: noisePeak, rand }), noiseHz ?? 400), 1);
  }
  return normalize(out, 0.88);
}

const jobs = [
  ['beds/halls.wav', () => bed({ freqs: [65.4, 98, 130.8], filter: 320, gain: 0.22, seed: 11 })],
  ['beds/haunt.wav', () => bed({ freqs: [24.5, 32.7, 41.2, 61.7], filter: 95, gain: 0.28, whisper: 580, sub: 18.35, seed: 21 })],
  ['beds/haunt-deep.wav', () => bed({ freqs: [18.35, 24.5, 30.87, 36.7], filter: 68, gain: 0.3, whisper: 410, sub: 14.5, seed: 22 })],
  ['beds/haunt-wind.wav', () => bed({ freqs: [27.5, 41.2, 82.4], filter: 210, gain: 0.24, whisper: 980, sub: 22, wind: true, seed: 23 })],
  ['beds/cyber.wav', () => bed({ freqs: [40, 80, 160, 320], filter: 420, gain: 0.2, whisper: 1280, sub: 40, seed: 31 })],
  ['beds/ages-past.wav', () => bed({ freqs: [38, 57, 76], filter: 180, gain: 0.24, sub: 22, seed: 41 })],
  ['beds/ages-future.wav', () => bed({ freqs: [48, 96, 192], filter: 360, gain: 0.22, whisper: 880, sub: 24, seed: 42 })],
  ['beds/ages-primordial.wav', () => bed({ freqs: [22, 33, 44], filter: 90, gain: 0.28, whisper: 180, sub: 14, seed: 43 })],
  ['beds/ages-industrial.wav', () => bed({ freqs: [55, 82, 110], filter: 240, gain: 0.24, whisper: 300, sub: 28, seed: 44 })],
  ['oneshot/whoosh.wav', () => normalize(lowpass(noise(0.28, { gain: 0.55, rand: seeded(51) }), 1800), 0.86)],
  ['oneshot/whoosh-haunt.wav', () => oneshotToneNoise({ from: 180, to: 70, seconds: 0.42, peak: 0.16, noiseHz: 900, noisePeak: 0.28, seed: 52 })],
  ['oneshot/whoosh-cyber.wav', () => oneshotToneNoise({ from: 620, to: 140, seconds: 0.26, peak: 0.18, noiseHz: 2400, noisePeak: 0.2, seed: 53 })],
  ['oneshot/whoosh-ages.wav', () => oneshotToneNoise({ from: 140, to: 48, seconds: 0.36, peak: 0.15, noiseHz: 600, noisePeak: 0.22, seed: 54 })],
  ['oneshot/slam.wav', () => oneshotToneNoise({ from: 70, to: 28, seconds: 0.22, peak: 0.22, noiseHz: 160, noisePeak: 0.28, seed: 61 })],
  ['oneshot/slam-haunt.wav', () => oneshotToneNoise({ from: 54, to: 18, seconds: 0.38, peak: 0.26, noiseHz: 110, noisePeak: 0.34, seed: 62 })],
  ['oneshot/slam-cyber.wav', () => oneshotToneNoise({ from: 90, to: 36, seconds: 0.2, peak: 0.2, noiseHz: 280, noisePeak: 0.24, seed: 63 })],
  ['oneshot/bolt.wav', () => oneshotToneNoise({ from: 420, to: 180, seconds: 0.12, peak: 0.16, noiseHz: 1800, noisePeak: 0.12, seed: 71 })],
  ['oneshot/punch.wav', () => oneshotToneNoise({ from: 220, to: 70, seconds: 0.16, peak: 0.22, noiseHz: 400, noisePeak: 0.2, seed: 72 })],
  ['oneshot/click.wav', () => oneshotToneNoise({ from: 420, to: 180, seconds: 0.05, peak: 0.08, noiseHz: 1800, noisePeak: 0.08, seed: 73 })],
  ['steps/wood.wav', () => normalize(lowpass(noise(0.07, { gain: 0.45, rand: seeded(81) }), 520), 0.7)],
  ['steps/stone.wav', () => normalize(lowpass(noise(0.06, { gain: 0.5, rand: seeded(82) }), 280), 0.72)],
  ['steps/metal.wav', () => oneshotToneNoise({ from: 280, to: 140, seconds: 0.06, peak: 0.1, noiseHz: 1600, noisePeak: 0.16, seed: 83 })],
  ['steps/dirt.wav', () => normalize(lowpass(noise(0.08, { gain: 0.4, rand: seeded(84) }), 180), 0.68)],
  ['steps/grate.wav', () => oneshotToneNoise({ from: 340, to: 90, seconds: 0.055, peak: 0.09, noiseHz: 2200, noisePeak: 0.14, seed: 85 })],
  ['fire/crackle.wav', () => normalize(highpass(lowpass(noise(0.07, { gain: 0.5, rand: seeded(91) }), 2400), 380), 0.6)],
  ['fire/hiss.wav', () => normalize(highpass(lowpass(noise(0.22, { gain: 0.22, decay: false, rand: seeded(92) }), 1800), 700), 0.45)],
  ['haunt/creak.wav', () => oneshotToneNoise({ from: 240, to: 110, seconds: 0.7, peak: 0.1, noiseHz: 380, noisePeak: 0.08, seed: 101 })],
  ['haunt/whisper.wav', () => oneshotToneNoise({ from: 660, to: 540, seconds: 1.05, peak: 0.03, noiseHz: 2100, noisePeak: 0.06, seed: 102 })],
  ['haunt/note.wav', () => oneshotToneNoise({ from: 34, to: 18, seconds: 1.4, peak: 0.14, noiseHz: 90, noisePeak: 0.1, seed: 103 })],
  ['haunt/shutter.wav', () => oneshotToneNoise({ from: 90, to: 50, seconds: 0.18, peak: 0.12, noiseHz: 180, noisePeak: 0.16, seed: 104 })],
  ['haunt/drip.wav', () => oneshotToneNoise({ from: 980, to: 420, seconds: 0.14, peak: 0.08, noiseHz: 2400, noisePeak: 0.05, seed: 105 })],
];

for (const folder of ['beds', 'oneshot', 'steps', 'fire', 'haunt']) {
  mkdirSync(join(out, folder), { recursive: true });
}

let bytes = 0;
for (const [relative, build] of jobs) {
  const wav = writeWav(build());
  writeFileSync(join(out, relative), wav);
  bytes += wav.length;
  console.log(`baked ${relative} ${wav.length}`);
}
console.log(`ok ${jobs.length} clips ${bytes} bytes`);
