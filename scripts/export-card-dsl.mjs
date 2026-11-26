/**
 * Exports the data-only part of game/cards.js as the Card DSL input.
 * Functions are intentionally omitted: native mechanics are implemented from explicit
 * primitives, while the JS engine remains the differential oracle until parity passes.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { assertValidCardCatalog } from './validate-card-schema.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'game', 'cards.js'), 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(`${source}\nglobalThis.__cardDsl = { normals: NORMALS, ggNormals: GG_NORMALS, characters: CHARACTERS };`, sandbox, { filename: 'game/cards.js' });
assertValidCardCatalog({
  NORMALS: sandbox.__cardDsl.normals,
  GG_NORMALS: sandbox.__cardDsl.ggNormals,
  CHARACTERS: sandbox.__cardDsl.characters,
});
function parseBeforeMove(text) {
  if (!text) return null;
  const farMatch = text.match(/Before:\s*(Advance|Close)\s+as far as possible/i);
  if (farMatch) {
    return { kind: farMatch[1].toLowerCase(), amount: 9, upTo: true };
  }
  const m = text.match(/Before:\s*(Advance|Close)\s+(?:up to\s+(\d+)|(\d+)\s+or\s+(\d+)|(\d+))/i);
  if (!m) return null;
  const kind = m[1].toLowerCase();
  if (m[2]) return { kind, amount: parseInt(m[2], 10), upTo: true };
  if (m[3] && m[4]) return { kind, amount: Math.max(parseInt(m[3], 10), parseInt(m[4], 10)), upTo: true };
  return { kind, amount: parseInt(m[5], 10), upTo: false };
}

function annotateCard(card) {
  return { ...card, beforeMove: parseBeforeMove(card.text) };
}

const dsl = sandbox.__cardDsl;
const rawGgNormals = dsl.ggNormals;
dsl.normals = dsl.normals.map(annotateCard);
dsl.ggNormals = dsl.ggNormals.map(annotateCard);
const normalizedCharacters = Object.fromEntries(
  Object.entries(dsl.characters).map(([key, charDef]) => {
    const clone = { ...charDef };
    clone.normalsPool = charDef.normals === rawGgNormals ? 'gg' : 'standard';
    if (Array.isArray(charDef.specials)) clone.specials = charDef.specials.map(annotateCard);
    delete clone.normals;
    return [key, clone];
  })
);
dsl.characters = normalizedCharacters;
dsl.parity = Object.fromEntries(
  Object.keys(dsl.characters).map((key) => [key, { dslParity: 'partial' }])
);
const json = JSON.stringify(dsl, (_key, value) => typeof value === 'function' ? undefined : value, 2);

if (process.argv.includes('--stdout')) process.stdout.write(`${json}\n`);
else {
  const out = path.join(root, 'native', 'generated', 'card-dsl.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${json}\n`);
  console.log(`Exported ${Object.keys(dsl.characters).length} fighters to ${path.relative(root, out)}`);
}
