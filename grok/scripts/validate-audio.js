import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(relative) {
  return JSON.parse(readFileSync(join(root, relative), 'utf8'));
}

export function validateAudio(manifest, { rootDir = root } = {}) {
  const errors = [];
  if (!manifest?.id) {
    errors.push('audio.id is required');
  }
  const buses = new Set(manifest?.buses ?? []);
  for (const bus of ['master', 'music', 'ambience', 'sfx']) {
    if (!buses.has(bus)) {
      errors.push(`missing bus ${bus}`);
    }
  }
  const clips = manifest?.clips ?? {};
  for (const [id, clip] of Object.entries(clips)) {
    if (!clip.url) {
      errors.push(`clip ${id} missing url`);
      continue;
    }
    if (!clip.bus) {
      errors.push(`clip ${id} missing bus`);
    }
    const relative = clip.url.replace(/^\//, 'public/');
    if (!existsSync(join(rootDir, relative))) {
      errors.push(`missing file for ${id}: ${clip.url}`);
    }
  }
  for (const [id, bed] of Object.entries(manifest?.beds ?? {})) {
    if (bed.clip && !clips[bed.clip]) {
      errors.push(`bed ${id} points at missing clip ${bed.clip}`);
    }
  }
  for (const [surface, spec] of Object.entries(manifest?.surfaces ?? {})) {
    if (spec.clip && !clips[spec.clip]) {
      errors.push(`surface ${surface} points at missing clip ${spec.clip}`);
    }
  }
  for (const event of manifest?.events ?? []) {
    if (event.clip && !clips[event.clip]) {
      errors.push(`event ${event.id} points at missing clip ${event.clip}`);
    }
    if (event.excludeTags?.includes('cyber') === false && event.tags?.includes('cyber')) {
      errors.push(`event ${event.id} is tagged cyber; haunt layer must stay off Circuit`);
    }
  }
  return errors;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const manifest = readJson('data/audio.json');
  const errors = validateAudio(manifest);
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  console.log(`ok audio ${Object.keys(manifest.clips).length} clips`);
}
