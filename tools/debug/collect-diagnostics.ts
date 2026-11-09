import fs from 'node:fs';
import path from 'node:path';
import { DiagnosticsManager } from '../../packages/diagnostics/src/index.js';
import { MOCK_A7R2_CAPABILITIES } from '../../packages/adapters-mock/src/index.js';

async function main() {
  const diag = new DiagnosticsManager({ sessionId: 'cli-diag-collector' });
  diag.emit({
    level: 'INFO',
    domain: 'SYSTEM',
    name: 'diagnostics.collected',
    adapter: 'MOCK',
    details: { collector: 'tools/debug/collect-diagnostics.ts' }
  });

  const manifestPath = path.resolve(process.cwd(), 'assets/manifest.json');
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    : { assets: [] };

  const zipBytes = await diag.exportBundle({
    includeImages: false,
    appState: { mode: 'CLI_SNAPSHOT', privateImagesIncluded: false },
    capabilities: MOCK_A7R2_CAPABILITIES,
    assetManifest: manifest
  });

  console.log(
    `Collected sanitized diagnostic bundle (${zipBytes.byteLength} bytes, includeImages=false).`
  );
}

main();
