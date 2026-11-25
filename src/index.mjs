export { runAudit, parseViewports, diffAgainstBaseline, VIEWPORT_PRESETS } from './engine/auditor.mjs';
export { formatMarkdown, formatSarif } from './report/format.mjs';
export { BUILTIN_RULES, loadRules } from './rules/index.mjs';
export {
  parseColor,
  rgbToHex,
  compositeOver,
  compositeStack,
  wcagContrastRatio,
  apcaContrastLc,
  suggestAccessibleColor,
} from './color/contrast.mjs';
