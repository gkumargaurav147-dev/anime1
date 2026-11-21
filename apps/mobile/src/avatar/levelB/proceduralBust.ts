import * as THREE from 'three';
import {
  ACCENT_PALETTE,
  EYE_PALETTE,
  HAIR_PALETTE,
  SKIN_PALETTE,
  type AvatarConfig,
  type AvatarFrame,
  type HandPose,
} from '@anime/scene-engine';

/**
 * Level B placeholder: a clean procedural 3D bust built from primitives. It is deliberately
 * simple — the point is the pipeline: morph targets with the canonical blendshape names
 * (driven by the same AvatarFrame as Level A), a head/neck/shoulder hierarchy, and hands
 * posed from the shared gesture clips. A designer's GLB (see ASSET_SPEC.md) replaces this
 * with no engine changes: `applyBlendshapes` works on any mesh with a morphTargetDictionary.
 */

export interface Bust {
  root: THREE.Group;
  update(frame: AvatarFrame): void;
  triangles: number;
  dispose(): void;
}

const DEG = Math.PI / 180;
const HEAD_RX: Record<AvatarConfig['faceShape'], [number, number]> = {
  round: [1, 1.04],
  oval: [0.94, 1.1],
  soft_square: [1, 1.02],
  heart: [1.02, 1.08],
  long: [0.9, 1.16],
  wide: [1.08, 0.98],
};

/** Drives morph targets by canonical name on any mesh (procedural or artist GLB). */
export function applyBlendshapes(root: THREE.Object3D, weights: Record<string, number>) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.morphTargetDictionary || !m.morphTargetInfluences) return;
    for (const [name, idx] of Object.entries(m.morphTargetDictionary)) {
      m.morphTargetInfluences[idx] = weights[name] ?? 0;
    }
  });
}

function morph(
  name: string,
  base: Float32Array,
  fn: (x: number, y: number, z: number) => [number, number, number],
) {
  const out = new Float32Array(base.length);
  for (let i = 0; i < base.length; i += 3) {
    const [dx, dy, dz] = fn(base[i]!, base[i + 1]!, base[i + 2]!);
    out[i] = dx;
    out[i + 1] = dy;
    out[i + 2] = dz;
  }
  const attr = new THREE.Float32BufferAttribute(out, 3);
  attr.name = name;
  return attr;
}

/** Head sphere with jawOpen / cheekPuff morph targets. */
function headGeometry() {
  const g = new THREE.SphereGeometry(1, 40, 28);
  const base = g.attributes.position!.array as Float32Array;
  g.morphTargetsRelative = true;
  g.morphAttributes.position = [
    morph('jawOpen', base, (x, y, z) =>
      y < -0.35 && z > -0.2 ? [0, -0.18 * ((-0.35 - y) / 0.65), 0] : [0, 0, 0],
    ),
    morph('cheekPuff', base, (x, y, z) =>
      y < 0.05 && y > -0.65 && z > 0.2 && Math.abs(x) > 0.35 ? [x * 0.1, 0, z * 0.04] : [0, 0, 0],
    ),
  ];
  return g;
}

/** Mouth: a flat ellipse whose outline morphs (smile, frown, open, pucker…). */
function mouthGeometry() {
  const N = 40;
  const rx = 0.3;
  const ry = 0.035;
  const shape = new THREE.Shape();
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const g = new THREE.ShapeGeometry(shape, 1);
  const base = g.attributes.position!.array as Float32Array;
  const side = (x: number, s: 1 | -1) => Math.max(0, (s * x) / rx); // 0 at centre → 1 at that corner
  const mid = (x: number) => 1 - (x / rx) ** 2;
  g.morphTargetsRelative = true;
  g.morphAttributes.position = [
    morph('jawOpen', base, (x, y) => [0, y < 0 ? -0.24 * mid(x) : 0.03 * mid(x), 0]),
    // The avatar's left is the viewer's right (+x).
    morph('mouthSmileLeft', base, (x) => [0.04 * side(x, 1), 0.11 * side(x, 1) ** 2, 0]),
    morph('mouthSmileRight', base, (x) => [-0.04 * side(x, -1), 0.11 * side(x, -1) ** 2, 0]),
    morph('mouthFrownLeft', base, (x) => [0, -0.08 * side(x, 1) ** 2, 0]),
    morph('mouthFrownRight', base, (x) => [0, -0.08 * side(x, -1) ** 2, 0]),
    morph('mouthPucker', base, (x, y) => [-0.65 * x, y * 2.5, 0.03]),
    morph('mouthFunnel', base, (x, y) => [-0.45 * x, y * 4, 0.02]),
    morph('mouthPressLeft', base, (x, y) => [0, x > 0 ? -0.7 * y : 0, 0]),
    morph('mouthPressRight', base, (x, y) => [0, x < 0 ? -0.7 * y : 0, 0]),
    morph('mouthLeft', base, () => [0.06, 0, 0]),
    morph('mouthRight', base, () => [-0.06, 0, 0]),
  ];
  return g;
}

const mat = (color: string, rough = 0.6) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });

function eye(irisColor: string) {
  const g = new THREE.Group();
  const white = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 12), mat('#FFFFFF', 0.3));
  white.scale.set(1, 1.05, 0.45);
  const iris = new THREE.Mesh(new THREE.CircleGeometry(0.12, 24), mat(irisColor, 0.4));
  iris.position.z = 0.092;
  const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.055, 18), mat('#15121A', 0.4));
  pupil.position.z = 0.094;
  const hi = new THREE.Mesh(
    new THREE.CircleGeometry(0.035, 12),
    new THREE.MeshBasicMaterial({ color: '#FFFFFF' }),
  );
  hi.position.set(0.04, 0.045, 0.096);
  g.add(white, iris, pupil, hi);
  return g;
}

function hairMeshes(style: AvatarConfig['hairStyle'], m: THREE.Material): THREE.Object3D[] {
  const cap = (theta = 0.44, r = 1.07) => {
    const c = new THREE.Mesh(
      new THREE.SphereGeometry(r, 32, 14, 0, Math.PI * 2, 0, Math.PI * theta),
      m,
    );
    c.rotation.x = -0.28;
    return c;
  };
  switch (style) {
    case 'bald':
      return [];
    case 'buzz':
      return [cap(0.36, 1.03)];
    case 'afro': {
      const a = new THREE.Mesh(new THREE.SphereGeometry(1.5, 24, 16), m);
      a.position.set(0, 0.35, -0.25);
      return [a, cap(0.42, 1.1)];
    }
    case 'bun': {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12), m);
      b.position.set(0, 1.12, -0.25);
      return [cap(), b];
    }
    case 'ponytail': {
      const t = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.8, 6, 12), m);
      t.position.set(0, 0.1, -1.05);
      t.rotation.x = 0.4;
      return [cap(), t];
    }
    case 'long_straight':
    case 'long_wavy':
    case 'bob': {
      const h = style === 'bob' ? 0.9 : 1.9;
      const back = new THREE.Mesh(
        new THREE.CylinderGeometry(
          1.08,
          style === 'long_wavy' ? 1.25 : 1.12,
          h,
          28,
          1,
          true,
          Math.PI * 0.55,
          Math.PI * 0.9,
        ),
        m,
      );
      back.position.set(0, -h / 2 + 0.25, -0.05);
      return [cap(0.47, 1.08), back];
    }
    case 'spiky': {
      const out: THREE.Object3D[] = [cap()];
      for (let i = 0; i < 7; i++) {
        const s = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 8), m);
        const a = -0.9 + i * 0.3;
        s.position.set(Math.sin(a) * 0.8, 1.0 - Math.abs(a) * 0.15, 0.1);
        s.rotation.z = -a * 0.5;
        out.push(s);
      }
      return out;
    }
    case 'curly_top': {
      const out: THREE.Object3D[] = [cap()];
      for (let i = 0; i < 9; i++) {
        const c = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), m);
        const a = -1.1 + i * 0.275;
        c.position.set(Math.sin(a) * 0.85, 0.95 - Math.abs(a) * 0.2, 0.25);
        out.push(c);
      }
      return out;
    }
    case 'side_part': {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 10), m);
      f.scale.set(1.4, 0.45, 0.8);
      f.position.set(0.35, 0.72, 0.62);
      f.rotation.z = -0.35;
      return [cap(), f];
    }
    default:
      return [cap()];
  }
}

function hand(m: THREE.Material) {
  const g = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), m);
  palm.scale.set(1, 1.1, 0.6);
  g.add(palm);
  const fingers = Array.from({ length: 5 }, (_, i) => {
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.16, 4, 8), m);
    f.userData.index = i;
    g.add(f);
    return f;
  });
  return { g, fingers };
}

/** Finger layout per hand shape: [x, y, rotZ, visible] for thumb, index, middle, ring, pinky. */
function poseFingers(fingers: THREE.Mesh[], shape: HandPose['shape']) {
  const open: [number, number, number][] = [
    [-0.17, -0.02, 0.9],
    [-0.08, 0.2, 0.15],
    [0, 0.22, 0],
    [0.08, 0.2, -0.15],
    [0.15, 0.16, -0.35],
  ];
  const show = (i: number) => {
    switch (shape) {
      case 'fist':
      case 'heart_left':
      case 'heart_right':
        return false;
      case 'thumbs_up':
        return i === 0;
      case 'peace':
        return i === 1 || i === 2;
      case 'point':
      case 'point_up':
        return i === 1;
      default:
        return true;
    }
  };
  fingers.forEach((f, i) => {
    const [x, y, r] = open[i]!;
    f.visible = show(i);
    f.position.set(x, shape === 'thumbs_up' && i === 0 ? 0.2 : y, 0);
    f.rotation.z = shape === 'thumbs_up' && i === 0 ? 0 : r;
  });
}

export function buildProceduralBust(c: AvatarConfig): Bust {
  const [skin, ,] = SKIN_PALETTE[c.skinTone];
  const [hairC] = HAIR_PALETTE[c.hairColor];
  const [iris] = EYE_PALETTE[c.eyeColor];
  const accent = ACCENT_PALETTE[c.accentColor];
  const cloth =
    c.outfit === 'jacket'
      ? '#34395E'
      : c.outfit === 'shirt'
        ? '#F1F2F8'
        : c.outfit === 'denim_jacket'
          ? '#5A7FB5'
          : accent[0];
  const skinM = mat(skin, 0.55);
  const hairM = mat(hairC, 0.5);
  const clothM = mat(cloth, 0.75);
  const darkM = mat('#2B2230', 0.6);

  const root = new THREE.Group();
  const body = new THREE.Group();
  const head = new THREE.Group();
  root.add(body, head);
  head.position.y = 0.25;

  // Shoulders + neck
  const shoulders = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.55),
    clothM,
  );
  shoulders.scale.set(1.28, 0.62, 0.78);
  shoulders.position.y = -1.95;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.37, 0.8, 18), skinM);
  neck.position.y = -1.05;
  body.add(shoulders, neck);
  if (c.collar === 'turtleneck') {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.45, 18), clothM);
    t.position.y = -1.2;
    body.add(t);
  }

  // Head with morph targets
  const [sx, sy] = HEAD_RX[c.faceShape];
  const skull = new THREE.Mesh(headGeometry(), skinM);
  skull.scale.set(sx, sy, 0.95);
  head.add(skull);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), skinM);
    ear.scale.set(0.5, 1, 0.7);
    ear.position.set(s * sx * 0.98, -0.02, 0);
    head.add(ear);
    if (c.earrings !== 'none') {
      const e =
        c.earrings === 'hoops'
          ? new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.015, 6, 16), mat('#F2C14E', 0.3))
          : new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), mat('#F2C14E', 0.3));
      e.position.set(s * sx * 0.99, -0.22, 0.03);
      head.add(e);
    }
  }

  const eyes = [eye(iris), eye(iris)];
  eyes.forEach((e, i) => {
    const s = i === 0 ? 1 : -1; // index 0 = avatar's left = viewer's right
    e.position.set(s * 0.36, 0.08, 0.86);
    head.add(e);
  });
  const brows = [0, 1].map((i) => {
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.22, 4, 8), mat(hairC, 0.6));
    b.rotation.z = Math.PI / 2;
    b.position.set((i === 0 ? 1 : -1) * 0.36, 0.36, 0.9);
    head.add(b);
    return b;
  });
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.085, 12, 8), skinM);
  nose.position.set(0, -0.12, 1.0);
  head.add(nose);

  const mouth = new THREE.Mesh(mouthGeometry(), mat('#5A1F2B', 0.6));
  mouth.position.set(0, -0.45, 0.93);
  mouth.updateMorphTargets();
  head.add(mouth);

  if (c.facialHair === 'full_beard' || c.facialHair === 'short_beard') {
    const beard = new THREE.Mesh(
      new THREE.SphereGeometry(1.02, 28, 14, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45),
      hairM,
    );
    beard.scale.set(sx, sy, 0.97);
    head.add(beard);
  }
  if (c.facialHair === 'mustache' || c.facialHair === 'goatee') {
    const mu = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.3, 4, 8), hairM);
    mu.rotation.z = Math.PI / 2;
    mu.position.set(0, -0.32, 0.97);
    head.add(mu);
  }
  if (c.glasses !== 'none') {
    for (const s of [-1, 1]) {
      const lens =
        c.glasses === 'round'
          ? new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.025, 6, 24), darkM)
          : new THREE.Mesh(
              new THREE.BoxGeometry(0.46, 0.34, 0.03),
              c.glasses === 'sunglasses'
                ? darkM
                : new THREE.MeshStandardMaterial({
                    color: '#BFE3FF',
                    transparent: true,
                    opacity: 0.25,
                  }),
            );
      lens.position.set(s * 0.36, 0.08, 1.0);
      head.add(lens);
    }
  }
  for (const h of hairMeshes(c.hairStyle, hairM)) head.add(h);

  // Hands (shown only while a gesture uses them)
  const hands = [hand(skinM), hand(skinM)];
  for (const h of hands) {
    h.g.visible = false;
    root.add(h.g);
  }

  let triangles = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      const g = m.geometry;
      triangles += (g.index ? g.index.count : g.attributes.position!.count) / 3;
    }
  });

  const placeHand = (h: (typeof hands)[number], pose: HandPose | null) => {
    if (!pose || pose.y > 290) {
      h.g.visible = false;
      return;
    }
    h.g.visible = true;
    // Bust space (256², head ≈ (128,104)) → world units.
    h.g.position.set((pose.x - 128) / 72, (150 - pose.y) / 72 - 0.15, 1.15);
    h.g.rotation.z = -pose.rot * DEG;
    h.g.scale.setScalar(pose.scale ?? 1);
    poseFingers(h.fingers, pose.shape);
  };

  return {
    root,
    triangles: Math.round(triangles),
    update(f) {
      const w = (k: string) => f.weights[k] ?? 0;
      head.rotation.set(f.head.pitch * DEG, f.head.yaw * DEG, -f.head.roll * DEG);
      head.position.y = 0.25 + f.breath * 0.012 - f.bodyDy * 0.01;
      body.scale.y = 1 + f.breath * 0.02;
      body.position.y = -f.bodyDy * 0.006;
      applyBlendshapes(skull, f.weights);
      applyBlendshapes(mouth, f.weights);
      eyes.forEach((e, i) => {
        const side = i === 0 ? 'Left' : 'Right';
        const open =
          Math.max(0.06, 1 - w(`eyeBlink${side}`) * 1.3 - w(`eyeSquint${side}`) * 0.35) *
          (1 + w(`eyeWide${side}`) * 0.2);
        e.scale.y = open;
        e.children.slice(1).forEach((c) => {
          c.position.x =
            (w('eyeLookRight') - w('eyeLookLeft')) * 0.05 + (c === e.children[3] ? 0.04 : 0);
        });
      });
      brows.forEach((b, i) => {
        const side = i === 0 ? 'Left' : 'Right';
        const s = i === 0 ? 1 : -1;
        b.position.y =
          0.36 -
          w(`browDown${side}`) * 0.07 +
          w('browInnerUp') * 0.05 +
          w(`browOuterUp${side}`) * 0.05;
        b.rotation.z = Math.PI / 2 + s * (w(`browDown${side}`) * 0.35 - w('browInnerUp') * 0.3);
      });
      placeHand(hands[1]!, f.hands.right);
      placeHand(hands[0]!, f.hands.left);
    },
    dispose() {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
        }
      });
    },
  };
}
