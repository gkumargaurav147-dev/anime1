import { memo, type ReactElement } from 'react';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
  Text,
} from 'react-native-svg';
import type { SvgNode } from '@anime/scene-engine';

/* eslint-disable @typescript-eslint/no-explicit-any */
const COMPONENTS: Record<string, any> = {
  g: G,
  path: Path,
  circle: Circle,
  ellipse: Ellipse,
  rect: Rect,
  text: Text,
  radialGradient: RadialGradient,
  linearGradient: LinearGradient,
  stop: Stop,
  clipPath: ClipPath,
};

const HOISTED = new Set(['clipPath', 'radialGradient', 'linearGradient']);

const camel = (k: string) => k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

function props(a: SvgNode['a']) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(a ?? {})) {
    if (v === undefined || k === 'xmlns') continue;
    out[camel(k)] = v;
  }
  return out;
}

/** Pulls gradients/clip paths out of the tree (react-native-svg wants them inside <Defs>). */
function split(node: SvgNode, defs: SvgNode[]): SvgNode | null {
  if (node.t === 'defs') {
    for (const c of node.c ?? []) if (typeof c !== 'string') defs.push(c);
    return null;
  }
  if (HOISTED.has(node.t)) {
    defs.push(node);
    return null;
  }
  const kids: (SvgNode | string)[] = [];
  for (const c of node.c ?? []) {
    if (typeof c === 'string') kids.push(c);
    else {
      const k = split(c, defs);
      if (k) kids.push(k);
    }
  }
  return { ...node, c: kids };
}

function toElement(node: SvgNode | string, key: number | string): ReactElement | string {
  if (typeof node === 'string') return node;
  const C = COMPONENTS[node.t];
  if (!C) return <G key={key} />;
  const children = node.c?.map((c, i) => toElement(c, i));
  return (
    <C key={key} {...props(node.a)}>
      {children}
    </C>
  );
}

/** Renders a scene-engine SvgNode (256×256 bust space) at `size` px. */
export const SvgTree = memo(function SvgTree({ tree, size }: { tree: SvgNode; size: number }) {
  const defs: SvgNode[] = [];
  const body = split(tree, defs);
  return (
    <Svg width={size} height={size} viewBox="0 0 256 256">
      <Defs>{defs.map((d, i) => toElement(d, `d${i}`))}</Defs>
      {body ? toElement(body, 'root') : null}
    </Svg>
  );
});
