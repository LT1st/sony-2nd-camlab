import { execSync } from 'node:child_process';

const steps = [
  ['Environment Doctor', 'pnpm doctor'],
  ['Asset & License Integrity', 'pnpm assets:check'],
  ['ESLint', 'pnpm lint'],
  ['TypeScript Typecheck', 'pnpm typecheck'],
  ['Unit & Integration Tests', 'pnpm test'],
  ['Event Replay Determinism', 'pnpm debug:replay -- tests/fixtures/capture-duplicate.jsonl'],
  ['Production Build', 'pnpm build']
];

for (const [label, command] of steps) {
  console.log(`\n>>> [preflight] Running: ${label} (${command})`);
  execSync(command, { stdio: 'inherit' });
}

console.log('\n>>> [preflight] ALL CHECKS PASSED.');
