# Contributing to UI Surgeon

UI Surgeon thrives on deterministic, zero-false-positive rules contributed by the community.

## Adding a New Audit Rule (5-Minute Guide)

1. Create a module under `src/rules/` (or test it first with `--rules-dir ./examples/custom-rules`):

```js
export default {
  id: 'my-rule-id',
  category: 'geometry', // geometry | contrast | accessibility | media | typography | runtime | seo
  severity: 'high',     // critical | high | medium | low
  wcag: '1.4.10',       // WCAG SC or standard reference
  description: 'One-sentence description of what this rule detects.',
  run(ctx) {
    // Available on ctx:
    // - ctx.probe (viewport, document, elements, images, headings, forms, fonts, landmarks)
    // - ctx.screenshotPng ({ width, height, data: Uint8Array RGBA })
    // - ctx.focusAudit ({ tabStopsVisited, missingIndicator, occludedOnFocus })
    // - ctx.runtime ({ consoleErrors, failedRequests, cls })
    // - ctx.viewport, ctx.colorScheme
    return [];
  },
};
```

2. Add a failing case to `test/fixtures/broken-landing.html` (or a new fixture) and assert it passes in `test/auditor.e2e.test.mjs`.
3. Run `npm test` (requires Node >= 22 and Chrome/Chromium).
4. Open a PR with before/after evidence!

## Principles
- **Zero runtime npm dependencies** — keep `package.json` `dependencies` empty.
- **Deterministic & low-noise** — every finding must include exact numeric evidence and a concrete root-cause `fix`.
- **Root-cause over symptoms** — deduplicate ancestor/descendant noise where possible.
