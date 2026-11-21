// Scene engine: text → scene description, scene catalog, layer composer, placeholder art.
export * from './schema';
export { SceneCatalog, defaultCatalog, loadCatalog } from './catalog/loader';
export type { AssetProvider, AssetRef } from './assets/AssetProvider';
export { PlaceholderAssetProvider } from './assets/PlaceholderAssetProvider';
export {
  composeScene,
  layoutAvatars,
  renderSvg,
  type ComposedScene,
  type Layer,
} from './compose/composer';
export {
  AUTO_SUGGEST_AT,
  CHIPS_AT,
  parseText,
  tierFor,
  type Candidate,
  type Entity,
  type ParseResult,
  type SuggestionTier,
} from './parser/parser';
export type { Intent } from './parser/lexicon';
export { normalize } from './parser/normalize';
export {
  allowedScenes,
  bubbleText,
  sceneFromCatalog,
  suggestScene,
  type EngineOptions,
  type SceneSuggestion,
} from './engine';
