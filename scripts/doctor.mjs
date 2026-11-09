import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function checkCmd(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

const nodeVer = process.version;
const pnpmVer = checkCmd('pnpm --version');
const pythonVer = checkCmd('python3 --version');
const manifestExists = fs.existsSync(path.join(rootDir, 'assets', 'manifest.json'));
const rawMetaExists = fs.existsSync(
  path.join(rootDir, 'assets', 'generated', 'sample-001', 'pipeline.json')
);

console.log('=== Camera Lab · Environment Doctor ===');
console.log(`Node.js          : ${nodeVer}`);
console.log(`pnpm             : ${pnpmVer ?? 'MISSING'}`);
console.log(`Python 3 (opt)   : ${pythonVer ?? 'Not found (optional for M0)'}`);
console.log(`assets/manifest  : ${manifestExists ? 'READY' : 'MISSING'}`);
console.log(`M1 RAW stages    : ${rawMetaExists ? 'READY' : 'MISSING'}`);

if (!pnpmVer || !manifestExists || !rawMetaExists) {
  console.error('[doctor] Environment check failed.');
  process.exit(1);
}
console.log('[doctor] PASS — Ready for offline development & testing.');
