import fs from 'node:fs';
import path from 'node:path';
import { evaluate, report } from '../test/evaluate';
import { holdout } from '../test/holdout';

// Prints the accuracy report and saves it to packages/scene-engine/eval-report.txt.
const main = report(evaluate(), 60);
const held = evaluate(holdout);
const heldPass = held.filter((r) => r.pass).length;
const heldText = [
  '',
  '='.repeat(60),
  `Held-out set (never used for tuning): ${heldPass}/${held.length} (${((100 * heldPass) / held.length).toFixed(1)}%)`,
  'The main corpus above was used to tune the rules, so its number is optimistic;',
  'this one is the honest estimate for new messages.',
  ...held
    .filter((r) => !r.pass)
    .map(
      (f) =>
        `✗ ${f.kind ? `[${f.kind}] ` : ''}"${f.text}" → expected ${f.expect ?? 'none'}, got ${f.got ?? 'none'} (${f.tier} ${f.confidence}) top3=${f.top3.join(',') || '-'}`,
    ),
].join('\n');

const text = main + '\n' + heldText;
console.log(text);
fs.writeFileSync(path.resolve(__dirname, '..', 'eval-report.txt'), text + '\n');
