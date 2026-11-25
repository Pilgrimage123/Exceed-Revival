import express from 'express';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
const htmlPath = path.resolve(__dirname, 'exceed_poc.html');
const gameDir = path.resolve(__dirname, 'game');
const buildScriptPath = path.resolve(__dirname, 'scripts', 'build-game.mjs');

function ensureFreshGameBundle() {
  if (!fs.existsSync(gameDir) || !fs.existsSync(buildScriptPath)) return;
  execFileSync(process.execPath, [buildScriptPath], { stdio: 'inherit' });
}

ensureFreshGameBundle();

app.use(express.static(path.resolve(__dirname, 'public')));

app.get('/', (_req, res) => {
  res.sendFile(htmlPath);
});

app.get('/exceed_poc.html', (_req, res) => {
  res.sendFile(htmlPath);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
