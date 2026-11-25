---
name: ui-surgeon
description: Closed-loop visual geometry, pixel-verified WCAG 2.1/APCA contrast, and WCAG 2.2 accessibility surgeon. Use whenever building, reviewing, fixing, or polishing web UI, HTML, CSS, React, Next.js, Vue, Svelte, or Tailwind pages to eliminate overflow, overlap, text clipping, hit-test occlusion, contrast failures, keyboard focus bugs, and responsive breakage across mobile, tablet, and desktop.
license: MIT
compatibility: Requires Node.js >= 22 and any local Chromium-based browser (Chrome, Chromium, Edge, Brave, or Arc). Zero npm dependencies.
allowed-tools: Bash Read Edit Grep Glob
argument-hint: <url-or-path> [--dark-mode] [--viewports mobile,tablet,desktop]
---

# UI Surgeon — Closed-Loop Visual & Accessibility Surgery

Never rely on eyesight or static code reading alone to verify UI quality. AI models miss 2px overflows, `4.1:1` contrast failures, sticky-header click occlusion, and broken focus rings.

Run the deterministic UI Surgeon audit engine in a closed loop until **0 critical and 0 high defects** remain across all viewports.

## Locate the CLI Runner

Use whichever command is available in this environment:
1. Standalone bundled script inside this skill: `node <skill-dir>/scripts/ui-surgeon.mjs`
2. Local workspace CLI: `node bin/ui-surgeon.mjs`
3. Global / npx CLI: `npx --yes ui-surgeon`

## Closed-Loop Surgical Protocol

Follow this exact 5-step loop (maximum 5 surgical passes per target):

### Step 1: Baseline Measurement
Run UI Surgeon against the live dev server URL, built directory, or HTML file, saving a baseline report and annotated screenshots:

```bash
ui-surgeon <target> --viewports mobile,tablet,desktop --annotate --out .ui-surgeon/pass-0
```

Add `--dark-mode` if the app supports dark theme.

### Step 2: Root-Cause Triage (Do Not Patch Symptoms)
Read the Markdown prescription ranked by severity (`critical` > `high` > `medium` > `low`).
- Group related findings by their root CSS/layout cause (e.g., one uncontained flex parent often causes 4 overflow + overlap findings).
- Inspect `.ui-surgeon/pass-0/annotated-*.png` when layout intent is ambiguous.
- For rule-specific fix patterns, consult `references/surgical-fix-patterns.md` before editing.
- For WCAG 2.2 / APCA thresholds, consult `references/wcag-quickref.md`.

### Step 3: Minimal Surgical Edit
Apply the smallest, cleanest semantic CSS/HTML/component fix:
- **Never** hide real overflow with `overflow-x: hidden` on `body` as a band-aid — fix the overflowing child container (`min-width: 0`, `max-width: 100%`, responsive grid/wrap).
- **Never** use `!important` unless overriding third-party styles.
- For `wcag-contrast`, prefer the deterministic hue-preserving `suggestedHex` emitted by the report, or adjust the surface background token consistently.
- For `clickable-non-interactive`, replace clickable `<div>`/`<span>` with native `<button type="button">` or `<a href>` instead of piling on ARIA hacks.
- For `focus-visibility`, add `:focus-visible` outlines (`outline: 2px solid ...; outline-offset: 2px;`) and `scroll-margin-top` matching sticky headers.

### Step 4: Re-Measure & Assert Zero Regressions
Re-run with `--baseline` pointing to the previous pass's `report.json`:

```bash
ui-surgeon <target> --viewports mobile,tablet,desktop --baseline .ui-surgeon/pass-0/report.json --out .ui-surgeon/pass-1
```

Check the **Baseline Diff** section:
- If **Regressions > 0**, revert or repair the newly introduced defect immediately before touching anything else.
- If **Critical > 0 or High > 0**, return to Step 2 with `pass-(N)` as the new baseline.

### Step 5: Stop Condition & Proof
Stop when:
- `critical == 0` AND `high == 0` AND `regressions == 0`, OR
- After 5 passes, report any remaining `medium`/`low` trade-offs honestly with exact numbers.

Report back concisely with:
1. Score progression (`before -> after`)
2. Exact defect counts resolved per category
3. Files modified
4. Confirmation that 0 regressions were introduced across all tested viewports.
