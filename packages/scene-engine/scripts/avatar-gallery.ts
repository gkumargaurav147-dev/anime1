/**
 * Dev tool: writes an HTML contact sheet of Level A avatars for a visual check.
 *   npx tsx scripts/avatar-gallery.ts <out.html>
 */
import fs from 'node:fs';
import { EXPRESSION_DEFS, GESTURES, LevelASvgRenderer, randomAvatar } from '../src';

const r = new LevelASvgRenderer();
const out = process.argv[2] ?? 'avatar-gallery.html';
const cell = (svg: string, label: string) =>
  `<figure><div class="a">${svg}</div><figcaption>${label}</figcaption></figure>`;

const people = Array.from({ length: 12 }, (_, i) => {
  const config = randomAvatar(`gallery-${i}`);
  return { id: `gallery-${i}`, config };
});
const hero = people[0]!;

const sections: string[] = [];
sections.push(
  '<h2>12 random avatars (smile, circle framing)</h2>' +
    people
      .map((p, i) =>
        cell(
          r.renderDocument({
            config: p.config,
            avatarId: p.id,
            expressionId: 'smile',
            framing: i % 2 ? 'square' : 'circle',
          }),
          `${p.config.hairStyle} · ${p.config.faceShape}`,
        ),
      )
      .join(''),
);
sections.push(
  `<h2>${EXPRESSION_DEFS.length} expressions (one avatar)</h2>` +
    EXPRESSION_DEFS.map((e) =>
      cell(r.renderDocument({ config: hero.config, avatarId: hero.id, expressionId: e.id }), e.id),
    ).join(''),
);
sections.push(
  `<h2>${GESTURES.length} gestures (mid-clip)</h2>` +
    GESTURES.map((g) =>
      cell(
        r.renderDocument({
          config: people[3]!.config,
          avatarId: people[3]!.id,
          expressionId: 'smile',
          gestureId: g.id,
          gestureElapsedMs: g.duration_ms * 0.62,
        }),
        g.id,
      ),
    ).join(''),
);

fs.writeFileSync(
  out,
  `<!doctype html><html><head><meta charset="utf-8"><title>Avatar gallery</title><style>
body{font-family:system-ui;background:#f4f3fb;margin:16px}h2{font-size:15px;margin:18px 0 6px;width:100%}
figure{display:inline-block;margin:6px;text-align:center}figcaption{font-size:11px;color:#555}
.a svg{width:150px;height:150px}</style></head><body>${sections.join('')}</body></html>`,
);
console.log(`wrote ${out}`);
