import fs from 'node:fs';
import path from 'node:path';
import { PlaceholderAssetProvider } from './assets/PlaceholderAssetProvider';
import { composeScene, renderSvg } from './compose/composer';
import { suggestScene } from './engine';

const USAGE = `Usage: scene "<message>" [--age <n>] [--teen] [--explain] [--svg <file>]

Prints the scene JSON for a chat message.
  --age <n>     user's age (romantic scenes are hidden under 18; default 18)
  --teen        same as --age 15
  --explain     print parser details (intent, entities, negation, sarcasm, top 3)
  --svg <file>  also render the scene with placeholder art to an SVG file`;

function main(argv: string[]) {
  const args = [...argv];
  const flag = (name: string) => {
    const i = args.indexOf(name);
    if (i === -1) return undefined;
    const v = args[i + 1];
    args.splice(i, 2);
    return v;
  };
  const bool = (name: string) => {
    const i = args.indexOf(name);
    if (i === -1) return false;
    args.splice(i, 1);
    return true;
  };

  if (bool('--help') || bool('-h')) return console.log(USAGE);
  const teen = bool('--teen');
  const explain = bool('--explain');
  const ageArg = flag('--age');
  const svgOut = flag('--svg');
  const text = args.join(' ').trim();
  if (!text) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  const age = teen ? 15 : ageArg !== undefined ? Number(ageArg) : 18;

  const result = suggestScene(text, { age });

  if (result.scene) {
    console.log(JSON.stringify(result.scene, null, 2));
  } else {
    console.log(
      JSON.stringify(
        {
          scene: null,
          suggestion: 'none',
          reason: 'confidence below 0.40 – show the scene picker',
          confidence: result.confidence,
        },
        null,
        2,
      ),
    );
  }

  if (explain || result.tier !== 'auto') {
    const p = result.parse;
    const lines = [
      `tier: ${result.tier} (confidence ${result.confidence})`,
      `intent: ${p.intent ?? '-'}  question: ${p.isQuestion}`,
      `entities: ${p.entities.map((e) => `${e.kind}=${e.value}${e.negated ? '(negated)' : ''}`).join(', ') || '-'}`,
      `negation: ${p.negation.present ? p.negation.negatedTerms.join(', ') || 'yes' : 'no'}`,
      `sarcasm: ${p.sarcasm.likely ? `likely (${p.sarcasm.cues.join('; ')})` : 'no'}`,
      `top 3: ${p.candidates.map((c) => `${c.scene_id} ${c.confidence}`).join(' | ') || '-'}`,
    ];
    console.error(lines.map((l) => `# ${l}`).join('\n'));
  }

  if (svgOut && result.scene) {
    const svg = renderSvg(composeScene(result.scene, new PlaceholderAssetProvider()));
    fs.writeFileSync(path.resolve(svgOut), svg);
    console.error(`# wrote ${svgOut}`);
  }
}

main(process.argv.slice(2));
