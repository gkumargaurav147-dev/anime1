import catalogV1 from './catalog.v1.json';
import {
  CATEGORIES,
  CatalogSchema,
  type Catalog,
  type CatalogScene,
  type Category,
} from '../schema';

/**
 * A validated, indexed catalog. Construct with `loadCatalog(json)`; the bundled one is
 * `defaultCatalog()`. Throws a readable error when the JSON doesn't match the schema, so a bad
 * catalog update fails loudly at startup instead of rendering garbage.
 */
export class SceneCatalog {
  readonly version: string;
  readonly scenes: readonly CatalogScene[];
  private readonly byId: Map<string, CatalogScene>;

  constructor(catalog: Catalog) {
    this.version = catalog.version;
    this.scenes = Object.freeze([...catalog.scenes]);
    this.byId = new Map(catalog.scenes.map((s) => [s.scene_id, s]));
  }

  get(sceneId: string): CatalogScene | undefined {
    return this.byId.get(sceneId);
  }

  byCategory(category: Category): CatalogScene[] {
    return this.scenes.filter((s) => s.category === category);
  }

  categories(): Category[] {
    return CATEGORIES.filter((c) => this.scenes.some((s) => s.category === c));
  }

  /**
   * Scenes a user of this age may ever see. This is the engine-level gate: scenes above the
   * user's age are removed before matching, so they can never be suggested, picked or
   * rendered for that user. Unknown age is treated as a minor.
   */
  forAge(age: number | null | undefined): CatalogScene[] {
    const a = typeof age === 'number' && Number.isFinite(age) ? age : 13;
    return this.scenes.filter((s) => s.min_age <= a);
  }
}

export function loadCatalog(json: unknown): SceneCatalog {
  const parsed = CatalogSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 10)
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid scene catalog:\n${issues}`);
  }
  return new SceneCatalog(parsed.data);
}

let cached: SceneCatalog | undefined;
export function defaultCatalog(): SceneCatalog {
  cached ??= loadCatalog(catalogV1);
  return cached;
}
