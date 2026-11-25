/**
 * Pluggable rule registry. External contributors can author custom rules as
 * standalone ESM modules exporting `export default { id, category, severity, wcag, run(ctx) }`
 * or `export const rules = [...]` and load them with `--rules-dir ./my-rules`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { geometryRules } from './geometry.mjs';
import { contrastRules } from './contrast.mjs';
import { accessibilityRules } from './accessibility.mjs';
import { mediaAndTypeRules } from './media-and-type.mjs';
import { runtimeRules } from './runtime.mjs';

export const BUILTIN_RULES = [
  ...geometryRules,
  ...contrastRules,
  ...accessibilityRules,
  ...mediaAndTypeRules,
  ...runtimeRules,
];

export async function loadRules({ rulesDir, only, ignore } = {}) {
  let rules = [...BUILTIN_RULES];

  if (rulesDir) {
    const absDir = path.resolve(rulesDir);
    if (fs.existsSync(absDir)) {
      const files = fs
        .readdirSync(absDir)
        .filter((f) => f.endsWith('.mjs') || f.endsWith('.js'))
        .sort();
      for (const file of files) {
        const mod = await import(pathToFileURL(path.join(absDir, file)).href);
        if (Array.isArray(mod.rules)) {
          rules.push(...mod.rules);
        } else if (mod.default && typeof mod.default.run === 'function') {
          rules.push(mod.default);
        }
      }
    }
  }

  if (only && only.length > 0) {
    const set = new Set(only);
    rules = rules.filter((r) => set.has(r.id) || set.has(r.category));
  }
  if (ignore && ignore.length > 0) {
    const set = new Set(ignore);
    rules = rules.filter((r) => !set.has(r.id) && !set.has(r.category));
  }

  return rules;
}
