import type { Action, Expression, TimeOfDay } from '../schema';

/**
 * One drawable asset in its own local coordinate space (0,0)-(width,height).
 * `anchor` is the point the composer positions (e.g. an avatar's feet).
 */
export type AssetRef =
  | { format: 'svg'; width: number; height: number; anchor: [number, number]; svg: string }
  | { format: 'lottie'; width: number; height: number; anchor: [number, number]; json: unknown };

/**
 * Where art comes from. The composer only talks to this interface, so placeholder shapes,
 * hand-drawn SVGs or Lottie animations can be swapped without touching scenes or layout.
 */
export interface AssetProvider {
  readonly name: string;
  readonly canvas: { width: number; height: number };
  background(id: string, timeOfDay: TimeOfDay): AssetRef;
  avatar(avatarId: string, expression: Expression, action: Action): AssetRef;
  prop(id: string): AssetRef;
  effect(id: string): AssetRef;
  bubble(text: string): AssetRef;
}
