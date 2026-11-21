# Avatar asset spec (for 3D and 2D artists)

This is the contract between the art and the app. Deliver files that follow it and they drop
in with **no code changes**: the engine drives faces by morph-target **name**, poses arms by
**bone name**, and swaps hair/outfit parts by **node name**.

Everything here must be **original**: no likeness of real people, and nothing copied from or
imitating any existing avatar product or brand (e.g. Samsung AR Emoji, Apple Memoji, Bitmoji).
Every file needs an entry in `ASSETS_LICENSES.md` (see §10).

Style: a stylized 3D cartoon bust (head and shoulders), soft shading, large expressive eyes
with highlights, simple rounded features, clear hair shapes. It must read at 48 px (chat list)
and at 360 px (demo screen).

---

## 1. Files and naming

```
avatar/
  base/bust_base.glb              # head + neck + shoulders, all morph targets, armature
  hair/hair_<style>.glb           # one per hairStyle option (e.g. hair_long_wavy.glb)
  outfit/outfit_<outfit>.glb      # one per outfit option, each containing collar_<collar> nodes
  accessories/glasses_<id>.glb, earrings_<id>.glb, facialhair_<id>.glb
  textures/atlas_1024.ktx2        # shared colour atlas (see §5)
  clips/<gesture_id>.glb          # animation-only GLB per gesture (or all in gestures.glb)
  fallback/<expression_id>.lottie # optional pre-rendered loops for low-end devices (§8)
```

Option ids are the ones in `packages/scene-engine/src/avatar/model.ts` (`AVATAR_OPTIONS`).
A part file is named exactly `<part>_<option_id>`; at least the MVP set (6+ per part) must
exist before a part ships.

## 2. Scale, units, orientation

| Item                       | Value                                                               |
| -------------------------- | ------------------------------------------------------------------- |
| Units                      | metres, 1 unit = 1 m (glTF default)                                 |
| Up / forward               | +Y up, character faces **+Z** (towards the camera)                  |
| Origin                     | centre of the base of the neck, at (0, 0, 0)                        |
| Head height (chin → crown) | 0.24 m; head centre at y ≈ 0.16                                     |
| Shoulder width             | 0.42 m; the bust is cut flat at y = −0.18                           |
| Left / right               | **Left = the character's own left** (appears on the viewer's right) |
| Rest pose                  | neutral face, mouth closed, eyes open, arms down outside the frame  |

The camera frames the bust with a 30° vertical FOV from (0, 0.12, 0.95); keep everything that
should be visible inside that frustum. The same framing is used for circle and square crops.

## 3. Morph targets (blendshapes)

Names must match exactly (case-sensitive). The list is generated from
`expressions.v1.json` → `blendshapes`; the expressions only use these:

```
eyeBlinkLeft   eyeBlinkRight   eyeSquintLeft   eyeSquintRight   eyeWideLeft   eyeWideRight
eyeLookUp      eyeLookDown     eyeLookLeft     eyeLookRight
browDownLeft   browDownRight   browInnerUp     browOuterUpLeft  browOuterUpRight
cheekPuff      cheekSquintLeft cheekSquintRight
noseSneerLeft  noseSneerRight
jawOpen        mouthClose      mouthFunnel     mouthPucker      mouthLeft     mouthRight
mouthSmileLeft mouthSmileRight mouthFrownLeft  mouthFrownRight
mouthPressLeft mouthPressRight mouthRollLower  mouthShrugUpper  tongueOut
```

- Each target is the **full** effect at weight 1.0; the engine scales 0–1 and combines them.
- Targets must combine cleanly (e.g. `jawOpen` + `mouthSmileLeft/Right` = laugh;
  `eyeBlink*` + `mouthSmile*` = happy closed eyes) with no interpenetration at full weight.
- `eyeLookLeft/Right` mean **towards the viewer's left/right** (gaze direction on screen).
- Put targets on every mesh they affect (head, teeth, tongue, brows, lashes) with the same
  names; the engine sets them by name on all meshes (`applyBlendshapes`).
- Overlay effects (tears, blush, sweat, anger mark, zzz, hearts…) are drawn by the app; do not
  bake them into targets. Optional: a `blush` material slot whose opacity the app can drive.

## 4. Skeleton

Required bones (names exact), parented as shown:

```
root
└─ spine_chest
   ├─ neck ── head ── (jaw)            # jaw optional if jawOpen is a morph target
   ├─ shoulder_L ── upperarm_L ── forearm_L ── hand_L ── thumb_L_01..03, index_L_01..03,
   │                                              middle_L_01..03, ring_L_01..03, pinky_L_01..03
   └─ shoulder_R ── … same with _R
```

- `head` drives pitch / yaw / roll from the expression + idle sway (±25°).
- `spine_chest` scales Y by up to 2 % for breathing and translates down for bowing.
- Hands: gestures place the **wrist** in bust space; the app solves the arm with 2-bone IK
  (upperarm → forearm → hand). Provide hand poses as animation clips or as named pose shapes:
  `open, fist, thumbs_up, peace, point, point_up, heart_left, heart_right, palm_face, flat`.
- Max 4 bone influences per vertex. ≤ 60 bones total.

## 5. Textures and materials

| Item                      | Value                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| Atlas                     | **one** 1024×1024 colour atlas for the bust + parts (KTX2/Basis, sRGB)                            |
| Optional                  | 512×512 normal map, 512×512 ORM (occlusion/roughness/metal)                                       |
| Skin, hair, eyes, clothes | flat colour regions in the atlas; the app tints them per avatar                                   |
| Materials                 | `M_Skin`, `M_Hair`, `M_EyeWhite`, `M_Iris`, `M_Lips`, `M_Teeth`, `M_Cloth`, `M_Accent`, `M_Metal` |

The app recolours by material name using the palettes in `model.ts` (`SKIN_PALETTE`,
`HAIR_PALETTE`, `EYE_PALETTE`, `ACCENT_PALETTE`), so paint those regions in a neutral mid-grey
(#BFBFBF) with shading in the normal/occlusion maps, not in the colour.

### Palette (for reference renders)

Skin: porcelain #FBE3D6 · ivory #F6D7BF · sand #EEC6A0 · honey #E2AE7E · golden #D9A066 ·
tan #C68A58 · caramel #B0743F · bronze #9A6136 · cocoa #7A4A2A · espresso #5A3520.
Hair: black #2A2730 · dark brown #4B2E1F · brown #7A4E2D · auburn #9A3F22 · blonde #E3BC6B ·
platinum #E9E3D8 · red #C9372C · pink #F08DB5 · blue #4D7CE0 · purple #8A5BD6 · gray #A7A3A0.
Accents: violet #6D5AE6 · coral #FF7A6B · teal #2BB3A3 · sunflower #F5C33B · sky #4FA8F2 ·
rose #E85D8E · mint #5CCB95 · tangerine #FF9B3D.

## 6. Parts (hair, outfit, accessories)

- Each part GLB contains one root node named exactly like the file (`hair_long_wavy`), skinned
  to the **same** armature bone names (or rigidly parented to `head` / `spine_chest`).
- Hair that hides the ears or forehead must still let the brows show at `browInnerUp` = 1.
- Outfits contain every collar variant as sibling nodes `collar_crew`, `collar_v_neck`,
  `collar_shirt_collar`, `collar_hood`, `collar_lapel`, `collar_turtleneck`; the app shows one.
- Glasses sit on `head`, lenses as a separate material `M_Lens` (alpha blend).

## 7. Budgets (Level B, mid-range Android, 30 fps)

| Budget                                                | Limit                                                 |
| ----------------------------------------------------- | ----------------------------------------------------- |
| Triangles, full bust with hair + outfit + accessories | **< 15 000**                                          |
| Draw calls                                            | ≤ 12                                                  |
| Textures                                              | one 1024 atlas (+ optional 512 normal / ORM)          |
| Morph targets                                         | 35 (list above); keep sparse (only affected vertices) |
| GLB size per part                                     | ≤ 300 KB (Draco/meshopt compressed); base ≤ 600 KB    |
| Gesture clip                                          | ≤ 2 s, 30 fps, bones only                             |

## 8. Fallback clips (optional, for low-end devices)

For devices that cannot run 3D, the app can play short pre-rendered loops instead of a still:
`fallback/<expression_id>.lottie` (dotLottie) or `.webm`, 2 s loop, 256×256, transparent
background, using the same default avatar. Name by expression id from `expressions.v1.json`.

## 9. Export settings (Blender → glTF 2.0)

- Format: **glTF Binary (.glb)**; +Y up; apply transforms; apply modifiers (except Armature).
- Include: selected objects, custom properties off, cameras/lights off.
- Mesh: UVs, normals, tangents (if normal map), vertex colours off; compression Draco level 6
  or meshopt.
- Shape keys: **on**, shape key normals on; animation: sampled 30 fps, NLA strips per clip,
  name clips exactly by gesture id (`wave`, `thumbs_up`, …).
- Validate with the Khronos glTF Validator (0 errors) before delivery.

## 10. Delivery checklist

- [ ] All names (files, nodes, bones, morph targets, materials, clips) match this spec exactly.
- [ ] Neutral rest pose; all morph targets at 0 look neutral.
- [ ] Every target listed in §3 exists and combines with the others without clipping.
- [ ] Triangle count, draw calls, texture and file sizes within §7 (include a screenshot of
      Blender's statistics).
- [ ] glTF Validator: 0 errors.
- [ ] Renders checked in the app's demo screen (Settings → Avatar expressions demo → 3D).
- [ ] **Original work**: no likeness of a real person; not derived from any existing avatar
      product, character or brand; no AI output trained to imitate one.
- [ ] Licence recorded in `ASSETS_LICENSES.md`: author, source, licence (owned by us,
      work-for-hire, or CC0 only), date, and file list.
