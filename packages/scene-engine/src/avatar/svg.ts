/**
 * Minimal SVG element tree. The Level A renderer builds this once per frame; it is serialised
 * to a string for scenes/tests and mapped to react-native-svg components on the phone.
 */
export interface SvgNode {
  t: string;
  a?: Record<string, string | number | undefined>;
  c?: (SvgNode | string)[];
}

export function h(
  t: string,
  a: SvgNode['a'] = {},
  ...c: (SvgNode | string | null | undefined | false | (SvgNode | null | undefined | false)[])[]
): SvgNode {
  const children: (SvgNode | string)[] = [];
  for (const x of c.flat()) if (x) children.push(x);
  return children.length ? { t, a, c: children } : { t, a };
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toSvgString(n: SvgNode | string): string {
  if (typeof n === 'string') return esc(n);
  const attrs = Object.entries(n.a ?? {})
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${typeof v === 'number' ? fmt(v) : esc(String(v))}"`)
    .join('');
  if (!n.c?.length) return `<${n.t}${attrs}/>`;
  return `<${n.t}${attrs}>${n.c.map(toSvgString).join('')}</${n.t}>`;
}

/** Numbers rounded to 2 decimals so output is stable and compact. */
export const fmt = (v: number) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

/** Tagged path builder that rounds numbers: p`M${x} ${y}` */
export function p(strings: TemplateStringsArray, ...vals: number[]) {
  let s = strings[0]!;
  vals.forEach((v, i) => (s += fmt(v) + strings[i + 1]!));
  return s;
}
