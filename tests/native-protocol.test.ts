import assert from 'node:assert/strict';
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
