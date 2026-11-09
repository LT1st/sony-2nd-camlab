import fs from 'node:fs';
import path from 'node:path';
import { replayEventsJsonl } from '../../packages/domain/src/index.js';

function main() {
  const args = process.argv.slice(2).filter((arg) => arg !== '--');
  const targetFile = args[0] ?? 'tests/fixtures/capture-duplicate.jsonl';
  const resolved = path.resolve(process.cwd(), targetFile);

  if (!fs.existsSync(resolved)) {
    console.error(`ERROR: JSONL file not found: ${resolved}`);
    process.exit(1);
  }

  const content = fs.readFileSync(resolved, 'utf-8');
  const firstRun = replayEventsJsonl(content);
  const secondRun = replayEventsJsonl(content);

  const deterministic =
    JSON.stringify(firstRun) === JSON.stringify(secondRun);

  if (!deterministic) {
    console.error('ERROR: Non-deterministic replay result detected!');
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        file: targetFile,
        deterministic,
        appliedEventsCount: firstRun.appliedEventsCount,
        deduplicatedCapturesCount: firstRun.deduplicatedCapturesCount,
        failedCapturesCount: firstRun.failedCapturesCount,
        activeRollId: firstRun.activeRollId,
        rolls: firstRun.rolls
      },
      null,
      2
    )
  );
}

main();
