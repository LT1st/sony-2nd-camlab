import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function main() {
  const manifestPath = path.join(rootDir, 'assets', 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('ERROR: assets/manifest.json does not exist.');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const assets = manifest.assets ?? [];

  if (assets.length < 12) {
    console.error(`ERROR: Expected >= 12 assets, found ${assets.length}`);
    process.exit(1);
  }

  const requiredFields = [
    'id',
    'title',
    'sourceUrl',
    'downloadUrl',
    'author',
    'license',
    'licenseUrl',
    'attribution',
    'sha256',
    'width',
    'height',
    'type',
    'canRedistribute',
    'cameraModel'
  ];

  const ghostPairs = new Set();

  for (const item of assets) {
    for (const field of requiredFields) {
      if (item[field] === undefined || item[field] === null || item[field] === '') {
        console.error(`ERROR: Asset ${item.id} missing required field "${field}"`);
        process.exit(1);
      }
    }
    if (item.canRedistribute !== true) {
      console.error(`ERROR: Asset ${item.id} does not allow redistribution.`);
      process.exit(1);
    }

    const samplePath = path.join(rootDir, 'assets', 'samples', `${item.id}.jpg`);
    const publicPath = path.join(
      rootDir,
      'apps',
      'web',
      'public',
      'assets',
      'samples',
      `${item.id}.jpg`
    );
    const licensePath = path.join(
      rootDir,
      'assets',
      'licenses',
      `${item.id}.LICENSE.txt`
    );

    for (const p of [samplePath, publicPath, licensePath]) {
      if (!fs.existsSync(p)) {
        console.error(`ERROR: Missing asset or license file: ${p}`);
        process.exit(1);
      }
    }

    const actualHash = sha256File(samplePath);
    if (actualHash !== item.sha256) {
      console.error(
        `ERROR: SHA256 mismatch for ${item.id}: expected ${item.sha256}, got ${actualHash}`
      );
      process.exit(1);
    }

    if (item.ghostPairId) {
      ghostPairs.add(item.ghostPairId);
    }
  }

  if (ghostPairs.size < 3) {
    console.error(`ERROR: Expected >= 3 ghost pairs, found ${ghostPairs.size}`);
    process.exit(1);
  }

  const rawPipelinePath = path.join(
    rootDir,
    'assets',
    'generated',
    'sample-001',
    'pipeline.json'
  );
  if (!fs.existsSync(rawPipelinePath)) {
    console.error('ERROR: Missing assets/generated/sample-001/pipeline.json');
    process.exit(1);
  }
  const rawPipeline = JSON.parse(fs.readFileSync(rawPipelinePath, 'utf-8'));
  for (const stage of rawPipeline.stages ?? []) {
    const stageFile = path.join(
      rootDir,
      'assets',
      'generated',
      'sample-001',
      stage.file
    );
    const pubStageFile = path.join(
      rootDir,
      'apps',
      'web',
      'public',
      'assets',
      'generated',
      'sample-001',
      stage.file
    );
    if (!fs.existsSync(stageFile) || !fs.existsSync(pubStageFile)) {
      console.error(`ERROR: Missing RAW stage file ${stage.file}`);
      process.exit(1);
    }
    const stageHash = sha256File(stageFile);
    if (stageHash !== stage.sha256) {
      console.error(`ERROR: SHA256 mismatch for RAW stage ${stage.file}`);
      process.exit(1);
    }
  }

  console.log(
    `[assets:check] PASS — ${assets.length} licensed samples, ${ghostPairs.size} Ghost pairs, and ${rawPipeline.stages.length} M1 RAW stages verified.`
  );
}

main();
