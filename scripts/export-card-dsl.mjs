/**
 * Exports the data-only part of game/cards.js as the Card DSL input.
 * Functions are intentionally omitted: native mechanics are implemented from explicit
 * primitives, while the JS engine remains the differential oracle until parity passes.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'game', 'cards.js'), 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(`${source}\nglobalThis.__cardDsl = { normals: NORMALS, ggNormals: GG_NORMALS, characters: CHARACTERS };`, sandbox, { filename: 'game/cards.js' });
const dsl = sandbox.__cardDsl;
const json = JSON.stringify(dsl, (_key, value) => typeof value === 'function' ? undefined : value, 2);

if (process.argv.includes('--stdout')) process.stdout.write(`${json}\n`);
else {
  const out = path.join(root, 'native', 'generated', 'card-dsl.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${json}\n`);
  console.log(`Exported ${Object.keys(dsl.characters).length} fighters to ${path.relative(root, out)}`);
}
