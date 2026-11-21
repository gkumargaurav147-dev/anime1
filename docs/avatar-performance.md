# Avatar performance notes (mid-range Android)

**Status: not yet measured on a real phone.** Development so far ran on Windows with the web
build; no Android device or emulator was available. Below are the budgets, what is built to
protect them, the numbers measured so far, and the exact steps to measure on a device.

## Target

30 fps on a mid-range Android phone (reference class: Snapdragon 6-series / Helio G9x,
4–6 GB RAM, Android 12+), in the demo screen and in a chat with two animated avatars.

## What protects the budget (built)

| Mechanism                                                                                                                                                                       | Where                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Level A updates at **30 fps max** (rAF throttled)                                                                                                                               | `apps/mobile/src/avatar/useAvatarClock.ts`                       |
| **FrameRateGovernor**: 2 s windows, ignores the warm-up window, trips after two windows under 24 fps → step down one level (3D → 2.5D → static) and remember it for this device | `packages/scene-engine/src/avatar/renderer.ts`, `AvatarView.tsx` |
| **Crash fallback**: a renderer that throws is marked failed for this device and skipped from then on; the avatar never blocks the chat text                                     | `AvatarView.tsx` (error boundary)                                |
| **Lazy 3D**: three.js / r3f are only evaluated when Level B is used                                                                                                             | `React.lazy` in `AvatarView.tsx`                                 |
| **3D behind a flag**, off by default                                                                                                                                            | `EXPO_PUBLIC_AVATAR_3D=1` or the demo screen switch              |
| Lists / profile use the **static** level (one render, no loop)                                                                                                                  | Settings profile picture                                         |
| Scenes render avatars **once** to a shared asset (500 identical avatars = 1 asset)                                                                                              | `composer.ts`                                                    |

## Measured so far (desktop web, for reference only)

| Item                    | Value                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------- |
| Level A bust            | ~25 paths, 6 gradients, 2 clip paths per frame; ≈ 4–6 KB of SVG                                   |
| Level B procedural bust | triangle count shown live in the demo screen (≈ 5–8 k depending on hair/accessories; budget 15 k) |
| Scene with 500 avatars  | renders; all avatar layers share one asset                                                        |

Desktop numbers say nothing about a mid-range phone; treat them as sanity checks only.

## Known risks

- **Level A re-renders ~80 SVG nodes per frame through React.** react-native-svg on Android is
  the most likely bottleneck. If the governor trips on Level A, the next steps are: render the
  static layers (hair, outfit, ears) once and animate only face layers; or move the per-frame
  math to Reanimated worklets.
- **expo-gl on Android** runs on the JS thread's GL context; heavy JS work (chat sync) can drop
  3D frames. The governor handles this by downgrading, but measure it with a busy chat.
- First 3D frame includes shader compilation (typically 100–300 ms); the warm-up window is
  ignored for this reason.

## How to measure on a device

1. `npx expo start`, open in Expo Go on the phone (same Wi-Fi), log in.
2. Settings → **Avatar expressions demo**. The line under the name shows level · fps ·
   triangles (3D).
3. For each renderer (2.5D, 3D) let it cycle for 60 s in _Expressions_ and _Combos_ modes;
   note the fps range. Then open a chat in another tab and send messages while it runs.
4. Android: enable _Developer options → Profile HWUI rendering_ for frame bars; or use
   `adb shell dumpsys gfxinfo host.exp.exponent` before/after for jank stats.
5. Record results in the table below.

| Device       | Android | Level | Mode        | fps (min / avg) | Jank % | Notes |
| ------------ | ------- | ----- | ----------- | --------------- | ------ | ----- |
| _to fill in_ |         | 2.5D  | expressions |                 |        |       |
| _to fill in_ |         | 3D    | combos      |                 |        |       |
