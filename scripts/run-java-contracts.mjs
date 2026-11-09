import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function collectJavaFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectJavaFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.java')) {
      results.push(full);
    }
  }
  return results;
}

function main() {
  const javaSrcRoot = path.join(
    rootDir,
    'apps',
    'camera-android',
    'src',
    'main',
    'java'
  );
  const vectorsPath = path.join(
    rootDir,
    'tests',
    'contracts',
    'state-machine-vectors.json'
  );

  const javaFiles = collectJavaFiles(javaSrcRoot);
  if (javaFiles.length === 0) {
    console.error('ERROR: No Java source files found in apps/camera-android');
    process.exit(1);
  }

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'camlab-java-build-'));
  try {
    execFileSync(
      'javac',
      ['-Xlint:-options', '--release', '8', '-d', outDir, ...javaFiles],
      { stdio: 'inherit' }
    );
    execFileSync(
      'java',
      [
        '-cp',
        outDir,
        'com.cameralab.a7r2.contract.ContractTestRunner',
        vectorsPath
      ],
      { stdio: 'inherit' }
    );
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}

main();
