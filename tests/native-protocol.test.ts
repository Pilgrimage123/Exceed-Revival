import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { canonicalTraceHash, canonicalizeTrace, NATIVE_AI_PROTOCOL_VERSION } from '../src/ai/native-protocol.ts';

test('native protocol has a stable version and canonical state hash', () => {
  assert.equal(NATIVE_AI_PROTOCOL_VERSION, 1);
  const trace = { b: [2, { z: true, a: 'x' }], a: 1 };
  assert.deepEqual(canonicalizeTrace(trace), { a: 1, b: [2, { a: 'x', z: true }] });
  assert.equal(canonicalTraceHash({ a: 1 }), '9c3e82dd6fcae8b1');
  // Must match Rust's UTF-8 FNV-1a canonical_hash byte-for-byte on non-ASCII strings.
  assert.equal(canonicalTraceHash({ name: 'Chun-Li—é' }), '75575cda03f23a7c');
});

test('checked-in card-dsl.json is fresh and uses normalized normalsPool references', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const checkedIn = fs.readFileSync(path.join(root, 'native', 'generated', 'card-dsl.json'), 'utf8');
  const generated = execFileSync(process.execPath, [path.join(root, 'scripts', 'export-card-dsl.mjs'), '--stdout'], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(checkedIn, generated, 'native/generated/card-dsl.json is stale; run npm run native:export-roster');
  const parsed = JSON.parse(checkedIn) as {
    normals: Array<{ beforeMove?: unknown }>;
    characters: Record<string, { normals?: unknown; normalsPool?: string; specials: Array<{ key: string; beforeMove?: unknown }> }>;
  };
  assert.ok(parsed.normals.every((c) => 'beforeMove' in c), 'normals should include beforeMove metadata');
  for (const [key, charDef] of Object.entries(parsed.characters)) {
    assert.equal(charDef.normals, undefined, `${key} should not embed a duplicate normals array`);
    assert.ok(charDef.normalsPool === 'standard' || charDef.normalsPool === 'gg', `${key} missing normalsPool`);
    assert.ok(charDef.specials.every((c) => 'beforeMove' in c), `${key} specials should include beforeMove metadata`);
  }
});
