/**
 * WCAG 2.1 / 2.2 Accessibility & Keyboard Focus Rules:
 * - missing-accessible-name
 * - missing-form-label
 * - missing-alt-text
 * - heading-hierarchy
 * - missing-landmarks
 * - duplicate-id
 * - clickable-non-interactive
 * - focus-indicator-missing
 * - focus-occluded-by-sticky
 */

export const accessibilityRules = [
  {
    id: 'missing-accessible-name',
    category: 'accessibility',
    severity: 'critical',
    wcag: '4.1.2 Name, Role, Value (A)',
    description: 'Interactive buttons and links must expose a non-empty accessible name.',
    run(ctx) {
      const findings = [];
      for (const el of ctx.probe.elements) {
        if (!el.interactive) continue;
        if (['input', 'select', 'textarea'].includes(el.tag)) continue;
        if (!el.accessibleName) {
          findings.push({
            ruleId: 'missing-accessible-name',
            severity: 'critical',
            category: 'accessibility',
            wcag: '4.1.2',
            selector: el.selector,
            rect: el.rect,
            message: `Interactive <${el.tag}> has no accessible name (invisible to screen readers).`,
            evidence: { tag: el.tag, role: el.role },
            fix: `Add visible text or \`aria-label="Describe action"\` to \`${el.selector}\`.`,
          });
        }
      }
      return findings;
    },
  },

  {
    id: 'missing-form-label',
    category: 'accessibility',
    severity: 'critical',
    wcag: '1.3.1 Info and Relationships / 3.3.2 Labels (A)',
    description: 'Form controls must have an explicit <label>, aria-label, or aria-labelledby.',
    run(ctx) {
      const findings = [];
      for (const f of ctx.probe.forms) {
        if (!f.accessibleName) {
          findings.push({
            ruleId: 'missing-form-label',
            severity: 'critical',
            category: 'accessibility',
            wcag: '1.3.1',
            selector: f.selector,
            rect: f.rect,
            message: `<${f.tag} type="${f.type}"> lacks an associated label${f.placeholder ? ` (placeholder "${f.placeholder}" is not an accessible label)` : ''}.`,
            evidence: { tag: f.tag, type: f.type, placeholder: f.placeholder },
            fix: `Associate a \`<label for="...">\` or add \`aria-label\` to \`${f.selector}\`.`,
          });
        }
      }
      return findings;
    },
  },

  {
    id: 'missing-alt-text',
    category: 'accessibility',
    severity: 'high',
    wcag: '1.1.1 Non-text Content (A)',
    description: 'Images must have an alt attribute (empty alt="" only for decorative images).',
    run(ctx) {
      const findings = [];
      for (const img of ctx.probe.images) {
        if (img.ariaHidden || img.role === 'presentation' || img.role === 'none') continue;
        if (img.alt === null) {
          findings.push({
            ruleId: 'missing-alt-text',
            severity: 'high',
            category: 'accessibility',
            wcag: '1.1.1',
            selector: img.selector,
            rect: img.rect,
            message: `<img> (${img.src.slice(0, 60)}) is missing the \`alt\` attribute.`,
            evidence: { src: img.src },
            fix: `Add descriptive \`alt="..."\` to \`${img.selector}\`, or \`alt=""\` if purely decorative.`,
          });
        }
      }
      return findings;
    },
  },

  {
    id: 'heading-hierarchy',
    category: 'accessibility',
    severity: 'medium',
    wcag: '1.3.1 Info and Relationships (A)',
    description: 'Checks for presence of H1 and sequential heading levels without skips.',
    run(ctx) {
      const findings = [];
      const headings = ctx.probe.headings;
      if (headings.length > 0 && !headings.some((h) => h.level === 1)) {
        findings.push({
          ruleId: 'heading-hierarchy',
          severity: 'medium',
          category: 'accessibility',
          wcag: '1.3.1',
          selector: headings[0].selector,
          rect: headings[0].rect,
          message: `Page has ${headings.length} headings but no <h1> landmark heading.`,
          evidence: { firstHeadingLevel: headings[0].level },
          fix: 'Use a single semantic `<h1>` for the primary page title.',
        });
      }
      for (let i = 1; i < headings.length; i++) {
        const prev = headings[i - 1];
        const curr = headings[i];
        if (curr.level > prev.level + 1) {
          findings.push({
            ruleId: 'heading-hierarchy',
            severity: 'medium',
            category: 'accessibility',
            wcag: '1.3.1',
            selector: curr.selector,
            rect: curr.rect,
            message: `Heading level skipped from <h${prev.level}> to <h${curr.level}> ("${curr.text.slice(0, 40)}").`,
            evidence: { previousLevel: prev.level, currentLevel: curr.level },
            fix: `Change \`${curr.selector}\` to \`<h${prev.level + 1}>\` and style size via CSS instead of heading tags.`,
          });
        }
      }
      return findings;
    },
  },

  {
    id: 'missing-landmarks',
    category: 'accessibility',
    severity: 'medium',
    wcag: '1.3.1 / 2.4.2 / 3.1.1 (A)',
    description: 'Verifies <html lang>, <title>, and <main> landmark presence.',
    run(ctx) {
      const findings = [];
      const { landmarks } = ctx.probe;
      if (!landmarks.lang) {
        findings.push({
          ruleId: 'missing-landmarks',
          severity: 'high',
          category: 'accessibility',
          wcag: '3.1.1',
          selector: 'html',
          message: 'Document <html> element is missing a `lang` attribute.',
          evidence: { missing: 'lang' },
          fix: 'Add `lang="en"` (or your page language code) to `<html>`.',
        });
      }
      if (!landmarks.title) {
        findings.push({
          ruleId: 'missing-landmarks',
          severity: 'medium',
          category: 'accessibility',
          wcag: '2.4.2',
          selector: 'head',
          message: 'Document is missing a non-empty <title>.',
          evidence: { missing: 'title' },
          fix: 'Add a descriptive `<title>` inside `<head>`.',
        });
      }
      if (landmarks.main === 0) {
        findings.push({
          ruleId: 'missing-landmarks',
          severity: 'medium',
          category: 'accessibility',
          wcag: '1.3.1',
          selector: 'body',
          message: 'Page has no `<main>` landmark region.',
          evidence: { mainCount: 0 },
          fix: 'Wrap the primary page content in a `<main>` element.',
        });
      }
      return findings;
    },
  },

  {
    id: 'duplicate-id',
    category: 'accessibility',
    severity: 'high',
    wcag: '4.1.1 Parsing / 1.3.1 (A)',
    description: 'Duplicate DOM IDs break label associations, ARIA references, and anchor links.',
    run(ctx) {
      return ctx.probe.duplicateIds.map((dup) => ({
        ruleId: 'duplicate-id',
        severity: 'high',
        category: 'accessibility',
        wcag: '1.3.1',
        selector: `#${dup.id}`,
        message: `Duplicate DOM id="#${dup.id}" appears ${dup.count} times.`,
        evidence: dup,
        fix: `Make every \`id\` unique across the document (found ${dup.count} copies of \`#${dup.id}\`).`,
      }));
    },
  },

  {
    id: 'clickable-non-interactive',
    category: 'accessibility',
    severity: 'high',
    wcag: '2.1.1 Keyboard (A)',
    description: 'Detects clickable <div>/<span> elements (cursor: pointer) that are unreachable via keyboard.',
    run(ctx) {
      return ctx.probe.clickableNonInteractive.slice(0, 10).map((item) => ({
        ruleId: 'clickable-non-interactive',
        severity: 'high',
        category: 'accessibility',
        wcag: '2.1.1',
        selector: item.selector,
        rect: item.rect,
        message: `<${item.tag}> "${item.text.slice(0, 36)}" uses \`cursor: pointer\` without semantic button/link or keyboard focusability.`,
        evidence: item,
        fix: `Replace \`<${item.tag}>\` at \`${item.selector}\` with a native \`<button type="button">\` or \`<a href>\`.`,
      }));
    },
  },

  {
    id: 'focus-visibility',
    category: 'accessibility',
    severity: 'high',
    wcag: '2.4.7 Focus Visible / 2.4.11 Focus Not Obscured (AA)',
    description: 'Dispatches real keyboard Tab presses to verify visible focus rings and detect sticky-header occlusion.',
    run(ctx) {
      const findings = [];
      const focusAudit = ctx.focusAudit;
      if (!focusAudit) return findings;

      for (const item of focusAudit.missingIndicator || []) {
        findings.push({
          ruleId: 'focus-visibility',
          severity: 'high',
          category: 'accessibility',
          wcag: '2.4.7',
          selector: item.selector,
          rect: item.rect,
          message: `Keyboard-focused element "${item.text.slice(0, 36)}" shows no visible focus indicator (outline/box-shadow/border unchanged).`,
          evidence: item,
          fix: `Add a clear \`:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }\` style on \`${item.selector}\`.`,
        });
      }

      for (const item of focusAudit.occludedOnFocus || []) {
        findings.push({
          ruleId: 'focus-visibility',
          severity: 'high',
          category: 'accessibility',
          wcag: '2.4.11',
          selector: item.selector,
          rect: item.rect,
          message: `Focused element is obscured by \`${item.occludedBy}\` during keyboard Tab navigation.`,
          evidence: item,
          fix: `Add \`scroll-margin-top\` (matching sticky header height) to focusable elements or adjust sticky overlay z-index.`,
        });
      }

      return findings;
    },
  },
];
