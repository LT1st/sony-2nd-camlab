import fs from 'node:fs';
import path from 'node:path';
import type { DiagnosticEvent } from '../../packages/contracts/src/index.js';

const events: DiagnosticEvent[] = [
  {
    timestamp: '2026-11-09T08:00:00.000Z',
    sessionId: 'sess-fixture-01',
    eventId: 'evt-0001',
    level: 'INFO',
    domain: 'FILM',
    name: 'roll.created',
    rollId: 'roll-fix-12',
    adapter: 'MOCK',
    details: {
      rollId: 'roll-fix-12',
      name: 'Ilford Delta 400 Test',
      capacity: 12,
      preset: 'MONO_SILVER',
      strictMode: true
    }
  },
  {
    timestamp: '2026-11-09T08:00:10.000Z',
    sessionId: 'sess-fixture-01',
    eventId: 'evt-0002',
    level: 'INFO',
    domain: 'FILM',
    name: 'capture.completed',
    rollId: 'roll-fix-12',
    captureId: 'cap-fix-001',
    durationMs: 95,
    adapter: 'MOCK',
    details: { frameIndex: 1, assetId: 'sample-001' }
  },
  {
    timestamp: '2026-11-09T08:00:10.050Z',
    sessionId: 'sess-fixture-01',
    eventId: 'evt-0003',
    level: 'WARN',
    domain: 'FILM',
    name: 'capture.completed',
    rollId: 'roll-fix-12',
    captureId: 'cap-fix-001',
    durationMs: 95,
    adapter: 'MOCK',
    details: { frameIndex: 1, assetId: 'sample-001', injectedDuplicate: true }
  },
  {
    timestamp: '2026-11-09T08:00:20.000Z',
    sessionId: 'sess-fixture-01',
    eventId: 'evt-0004',
    level: 'INFO',
    domain: 'FILM',
    name: 'capture.completed',
    rollId: 'roll-fix-12',
    captureId: 'cap-fix-002',
    durationMs: 102,
    adapter: 'MOCK',
    details: { frameIndex: 2, assetId: 'sample-002' }
  },
  {
    timestamp: '2026-11-09T08:00:30.000Z',
    sessionId: 'sess-fixture-01',
    eventId: 'evt-0005',
    level: 'INFO',
    domain: 'FILM',
    name: 'capture.completed',
    rollId: 'roll-fix-12',
    captureId: 'cap-fix-003',
    durationMs: 88,
    adapter: 'MOCK',
    details: { frameIndex: 3, assetId: 'sample-003' }
  },
  {
    timestamp: '2026-11-09T08:00:40.000Z',
    sessionId: 'sess-fixture-01',
    eventId: 'evt-0006',
    level: 'ERROR',
    domain: 'FILM',
    name: 'capture.failed',
    rollId: 'roll-fix-12',
    captureId: 'cap-fix-004-fail',
    errorCode: 'SHUTTER_FAILED',
    adapter: 'MOCK',
    details: { frameIndex: 4, reason: 'Injected 4th frame failure' }
  }
];

const outPath = path.resolve(process.cwd(), 'tests/fixtures/capture-duplicate.jsonl');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(
  outPath,
  events.map((e) => JSON.stringify(e)).join('\n') + '\n',
  'utf-8'
);
console.log(`Wrote fixture to ${outPath}`);
