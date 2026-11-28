import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const gameDir = path.join(rootDir, 'game');

const PLACEHOLDER = '<!-- EXCEED_BUNDLE_SCRIPTS -->';

const CORE_MODULES = ['events.js', 'cards.js', 'engine.js', 'preview.js', 'native-ai.js', 'ai.js'];
const UI_MODULES = ['ui.js', 'telegraph.js', 'playback.js', 'audio.js', 'input.js', 'howtoplay.js', 'portraits.js', 'standees.js', 'standee-stage.js', 'render.js', 'fighter-preview.js', 'portrait-tester.js'];

function readGameFile(name) {
  const fullPath = path.join(gameDir, name);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing source module: ${fullPath}`);
  }
  return fs.readFileSync(fullPath, 'utf8').replace(/\n$/, '');
}

function validateJsSyntax(filename, code) {
  try {
    new vm.Script(code, { filename });
  } catch (err) {
    throw new Error(`Syntax error in game/${filename}: ${err.message}`);
  }
}

export function ensureCardDslExport() {
  const exportScript = path.join(rootDir, 'scripts', 'export-card-dsl.mjs');
  if (fs.existsSync(exportScript)) {
    execFileSync(process.execPath, [exportScript], { stdio: 'inherit' });
  }
}

export function buildGameBundle() {
  ensureCardDslExport();
  const shell = fs.readFileSync(path.join(gameDir, 'shell.html'), 'utf8');
  if (!shell.includes(PLACEHOLDER)) {
    throw new Error(`game/shell.html is missing required ${PLACEHOLDER} marker.`);
  }

  const coreSources = CORE_MODULES.map((name) => {
    const src = readGameFile(name);
    validateJsSyntax(name, src);
    return src;
  });

  const uiSources = UI_MODULES.map((name) => {
    const src = readGameFile(name);
    validateJsSyntax(name, src);
    return src;
  });

  const injected = [
    '<script>',
    ...coreSources,
    '</script>',
    ...uiSources.flatMap((src) => ['<script>', src, '</script>']),
  ].join('\n');

  // Use a function replacer so `$` sequences inside JS strings are never interpreted as regex backreferences.
  const output = shell.replace(PLACEHOLDER, () => injected);
  const outPath = path.join(rootDir, 'exceed_poc.html');
  fs.writeFileSync(outPath, output, 'utf8');
  return { outPath, bytes: Buffer.byteLength(output, 'utf8') };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const result = buildGameBundle();
  console.log(`Built ${path.basename(result.outPath)} (${result.bytes} bytes) from modular game/ sources.`);
}
