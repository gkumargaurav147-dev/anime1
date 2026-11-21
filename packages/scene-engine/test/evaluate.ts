import { defaultCatalog } from '../src/catalog/loader';
import { suggestScene } from '../src/engine';
import type { SuggestionTier } from '../src/parser/parser';
import { corpus, type CorpusCase } from './corpus';

export interface CaseResult extends CorpusCase {
  got: string | null;
  tier: SuggestionTier;
  confidence: number;
  top3: string[];
  pass: boolean;
  top3Pass: boolean;
  category: string;
}

/** Runs the corpus as an adult user (so every catalog scene is eligible). */
export function evaluate(cases: CorpusCase[] = corpus): CaseResult[] {
  const catalog = defaultCatalog();
  return cases.map((c) => {
    const r = suggestScene(c.text, { age: 30 });
    const top3 = r.alternatives.map((a) => a.scene_id);
    const got = r.tier === 'none' ? null : (top3[0] ?? null);
    let pass: boolean;
    let top3Pass: boolean;
    if (c.kind === 'sarcasm') {
      // Sarcasm must lower confidence below auto-suggest; if a scene is expected it should be offered.
      const offered = c.expect === null || r.tier === 'none' || top3.includes(c.expect);
      pass = r.tier !== 'auto' && offered;
      top3Pass = pass;
    } else if (c.expect === null) {
      pass = r.tier === 'none';
      top3Pass = pass;
    } else {
      pass = got === c.expect;
      top3Pass = r.tier !== 'none' && top3.includes(c.expect);
    }
    const category = c.kind ?? (c.expect ? (catalog.get(c.expect)?.category ?? '?') : 'no_scene');
    return { ...c, got, tier: r.tier, confidence: r.confidence, top3, pass, top3Pass, category };
  });
}

export function report(results: CaseResult[], failureSample = 60): string {
  const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : 'n/a');
  const lines: string[] = [];
  const pass = results.filter((r) => r.pass).length;
  const top3 = results.filter((r) => r.top3Pass).length;
  lines.push('Scene engine — Level 1 parser accuracy report');
  lines.push('='.repeat(60));
  lines.push(`Sentences:            ${results.length}`);
  lines.push(`Top-1 accuracy:       ${pass}/${results.length} (${pct(pass, results.length)})`);
  lines.push(`Top-3 accuracy:       ${top3}/${results.length} (${pct(top3, results.length)})`);

  const tiers = { auto: 0, chips: 0, none: 0 } as Record<SuggestionTier, number>;
  for (const r of results) tiers[r.tier]++;
  lines.push(
    `Tiers:                auto ${tiers.auto} · chips ${tiers.chips} · none ${tiers.none}`,
  );
  const autos = results.filter(
    (r) => r.tier === 'auto' && r.kind !== 'sarcasm' && r.expect !== null,
  );
  const autoRight = autos.filter((r) => r.pass).length;
  lines.push(
    `Auto-suggest precision: ${autoRight}/${autos.length} (${pct(autoRight, autos.length)})`,
  );

  lines.push('');
  lines.push('By group:');
  const groups = new Map<string, CaseResult[]>();
  for (const r of results) groups.set(r.category, [...(groups.get(r.category) ?? []), r]);
  for (const [g, rs] of [...groups.entries()].sort()) {
    const p = rs.filter((r) => r.pass).length;
    lines.push(
      `  ${g.padEnd(18)} ${String(p).padStart(3)}/${String(rs.length).padEnd(3)} ${pct(p, rs.length).padStart(6)}`,
    );
  }

  const failures = results.filter((r) => !r.pass);
  lines.push('');
  lines.push(`Failures: ${failures.length} (showing ${Math.min(failureSample, failures.length)})`);
  for (const f of failures.slice(0, failureSample)) {
    const tag = f.kind ? `[${f.kind}] ` : '';
    lines.push(
      `✗ ${tag}"${f.text}" → expected ${f.expect ?? 'none'}, got ${f.got ?? 'none'} (${f.tier} ${f.confidence}) top3=${f.top3.join(',') || '-'}`,
    );
  }
  return lines.join('\n');
}
