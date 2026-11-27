import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(import.meta.dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'assets', 'portraits', 'manifest.json');
const PORTRAITS_PATH = path.join(ROOT, 'game', 'portraits.js');
const CARDS_PATH = path.join(ROOT, 'game', 'cards.js');

const VALID_STATUSES = new Set(['unaudited', 'approved', 'needs-source']);

function sha256(str: string): string {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

function parseJpegDimensions(buf: Buffer): { width: number; height: number } {
  assert.ok(buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8, 'Invalid JPEG SOI magic bytes');
  let i = 2;
  while (i + 3 < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      i += 2;
      continue;
    }
    if (i + 4 > buf.length) break;
    const segLen = buf.readUInt16BE(i + 2);
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      if (i + 9 <= buf.length) {
        const height = buf.readUInt16BE(i + 5);
        const width = buf.readUInt16BE(i + 7);
        return { width, height };
      }
    }
    i += 2 + segLen;
  }
  throw new Error('Could not locate JPEG SOF marker');
}

function loadPortraitsAndRoster() {
  const cardsCode = fs.readFileSync(CARDS_PATH, 'utf8');
  const portraitsCode = fs.readFileSync(PORTRAITS_PATH, 'utf8');
  const ctx: Record<string, any> = {};
  vm.runInNewContext(
    cardsCode + '\n' + portraitsCode + '\nthis.CHARACTERS=CHARACTERS;this.FIGHTER_PHOTOS=FIGHTER_PHOTOS;this.FIGHTER_HEADSHOTS=FIGHTER_HEADSHOTS;',
    ctx
  );
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  return {
    characters: ctx.CHARACTERS as Record<string, unknown>,
    photos: ctx.FIGHTER_PHOTOS as Record<string, string>,
    headshots: ctx.FIGHTER_HEADSHOTS as Record<string, string>,
    manifest,
  };
}

test('Portrait Manifest covers all 41 CHARACTERS with valid Source Art paths and status invariants', () => {
  const { characters, photos, headshots, manifest } = loadPortraitsAndRoster();
  const rosterKeys = Object.keys(characters);
  assert.equal(rosterKeys.length, 41, 'Expected 41 CHARACTERS');
  assert.equal(manifest.version, 1);
  assert.ok(manifest.fighters && typeof manifest.fighters === 'object');

  for (const key of rosterKeys) {
    assert.ok(photos[key], `Missing FIGHTER_PHOTOS entry for ${key}`);
    assert.ok(headshots[key], `Missing FIGHTER_HEADSHOTS entry for ${key}`);
    const entry = manifest.fighters[key];
    assert.ok(entry, `Missing manifest.fighters entry for ${key}`);
    assert.ok(VALID_STATUSES.has(entry.status), `Invalid status "${entry.status}" for ${key}`);
    if (entry.locked) {
      assert.equal(entry.status, 'approved', `Fighter ${key} cannot be locked unless status === "approved"`);
    }
    const rawAbs = path.join(ROOT, entry.sourcePath);
    assert.ok(fs.existsSync(rawAbs), `Missing Source Art at ${entry.sourcePath} for ${key}`);
    assert.ok(fs.statSync(rawAbs).size > 5000, `Source Art too small for ${key}`);
  }
});

test('All Fighter Portraits are valid JPEGs with expected dimensions, no NaN/undefined, and zero drift on locked fighters', () => {
  const { characters, photos, headshots, manifest } = loadPortraitsAndRoster();

  for (const key of Object.keys(characters)) {
    const fullUri = photos[key];
    const hsUri = headshots[key];

    for (const [kind, uri] of [
      ['Full Portrait', fullUri],
      ['Headshot', hsUri],
    ] as const) {
      assert.ok(uri.startsWith('data:image/jpeg;base64,'), `${key} ${kind} must be data:image/jpeg;base64`);
      assert.equal(uri.includes('NaN'), false, `${key} ${kind} base64 contains "NaN"`);
      assert.equal(uri.includes('undefined'), false, `${key} ${kind} base64 contains "undefined"`);

      const buf = Buffer.from(uri.slice('data:image/jpeg;base64,'.length), 'base64');
      assert.ok(buf.length > 5000, `${key} ${kind} JPEG buffer unexpectedly small (${buf.length} bytes)`);
      assert.equal(buf[buf.length - 2], 0xff, `${key} ${kind} missing JPEG EOI 0xFF`);
      assert.equal(buf[buf.length - 1], 0xd9, `${key} ${kind} missing JPEG EOI 0xD9`);

      const dim = parseJpegDimensions(buf);
      if (kind === 'Full Portrait') {
        assert.equal(dim.width, 480, `${key} Full Portrait width must be 480 (got ${dim.width})`);
        assert.ok(dim.height >= 480, `${key} Full Portrait height unexpectedly short (${dim.height})`);
      } else {
        assert.equal(dim.width, 480, `${key} Headshot width must be 480 (got ${dim.width})`);
        assert.equal(dim.height, 600, `${key} Headshot height must be 600 (got ${dim.height})`);
      }
    }

    const entry = manifest.fighters[key];
    if (entry.locked && entry.status === 'approved') {
      assert.equal(sha256(fullUri), entry.fullHash, `Locked Full Portrait hash drift detected for ${key}`);
      assert.equal(sha256(hsUri), entry.headshotHash, `Locked Headshot hash drift detected for ${key}`);
    }
  }
});
