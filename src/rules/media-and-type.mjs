/**
 * Media integrity, typography legibility, and webfont loading rules:
 * - broken-image
 * - distorted-image
 * - unreadable-font-size
 * - excessive-line-length
 * - cramped-line-height
 * - unloaded-webfont
 */

export const mediaAndTypeRules = [
  {
    id: 'broken-image',
    category: 'media',
    severity: 'critical',
    wcag: '1.1.1 Non-text Content (A)',
    description: 'Detects <img> elements that failed to load (naturalWidth === 0).',
    run(ctx) {
      const findings = [];
      for (const img of ctx.probe.images) {
        if (!img.complete || img.naturalWidth === 0) {
          findings.push({
            ruleId: 'broken-image',
            severity: 'critical',
            category: 'media',
            wcag: '1.1.1',
            selector: img.selector,
            rect: img.rect,
            message: `Broken image: "${img.src}" failed to load (naturalWidth = 0).`,
            evidence: { src: img.src, complete: img.complete },
            fix: `Fix the image URL or asset path on \`${img.selector}\`.`,
          });
        }
      }
      return findings;
    },
  },

  {
    id: 'distorted-image',
    category: 'media',
    severity: 'medium',
    wcag: 'Visual Craft',
    description: 'Detects stretched/squished images rendered far from their natural aspect ratio without object-fit.',
    run(ctx) {
      const findings = [];
      for (const img of ctx.probe.images) {
        if (img.naturalWidth < 16 || img.naturalHeight < 16) continue;
        if (img.renderedWidth < 16 || img.renderedHeight < 16) continue;
        if (['cover', 'contain', 'scale-down'].includes(img.objectFit)) continue;

        const natRatio = img.naturalWidth / img.naturalHeight;
        const renRatio = img.renderedWidth / img.renderedHeight;
        const distortion = Math.abs(natRatio - renRatio) / natRatio;

        if (distortion > 0.18) {
          findings.push({
            ruleId: 'distorted-image',
            severity: 'medium',
            category: 'media',
            wcag: 'Visual Craft',
            selector: img.selector,
            rect: img.rect,
            message: `Image aspect ratio distorted by ${Math.round(distortion * 100)}% (natural ${img.naturalWidth}x${img.naturalHeight} vs rendered ${img.renderedWidth}x${img.renderedHeight}).`,
            evidence: {
              natural: `${img.naturalWidth}x${img.naturalHeight}`,
              rendered: `${img.renderedWidth}x${img.renderedHeight}`,
              distortionPct: Math.round(distortion * 100),
            },
            fix: `Add \`object-fit: cover\` or \`height: auto\` on \`${img.selector}\`.`,
          });
        }
      }
      return findings;
    },
  },

  {
    id: 'unreadable-font-size',
    category: 'typography',
    severity: 'medium',
    wcag: '1.4.4 Resize Text (AA)',
    description: 'Flags body/interactive text rendered smaller than 12px.',
    run(ctx) {
      const findings = [];
      for (const el of ctx.probe.elements) {
        if (!el.directText || el.text.length < 4) continue;
        if (el.fontSize < 12) {
          findings.push({
            ruleId: 'unreadable-font-size',
            severity: el.fontSize < 10 ? 'high' : 'medium',
            category: 'typography',
            wcag: '1.4.4',
            selector: el.selector,
            rect: el.rect,
            message: `Text "${el.text.slice(0, 32)}" renders at ${Math.round(el.fontSize * 10) / 10}px (< 12px minimum legible size).`,
            evidence: { fontSizePx: el.fontSize },
            fix: `Increase \`font-size\` on \`${el.selector}\` to at least \`12px\` (14–16px for body text).`,
          });
        }
      }
      return findings.slice(0, 10);
    },
  },

  {
    id: 'cramped-line-height',
    category: 'typography',
    severity: 'low',
    wcag: '1.4.12 Text Spacing (AA)',
    description: 'Detects multi-line paragraphs with line-height below 1.25x font-size.',
    run(ctx) {
      const findings = [];
      for (const el of ctx.probe.elements) {
        if (!['p', 'li', 'dd', 'blockquote'].includes(el.tag)) continue;
        if (!el.directText || el.text.length < 50) continue;
        const lines = el.rect.height / Math.max(1, el.lineHeight);
        if (lines < 1.8) continue;
        const ratio = el.lineHeight / Math.max(1, el.fontSize);
        if (ratio < 1.25) {
          findings.push({
            ruleId: 'cramped-line-height',
            severity: 'low',
            category: 'typography',
            wcag: '1.4.12',
            selector: el.selector,
            rect: el.rect,
            message: `Multi-line prose has cramped line-height (${ratio.toFixed(2)}x < 1.25x).`,
            evidence: { lineHeightRatio: Math.round(ratio * 100) / 100, fontSizePx: el.fontSize },
            fix: `Set \`line-height: 1.5\` on \`${el.selector}\` for comfortable reading.`,
          });
        }
      }
      return findings.slice(0, 8);
    },
  },

  {
    id: 'unloaded-webfont',
    category: 'typography',
    severity: 'medium',
    wcag: 'Visual Craft',
    description: 'Detects @font-face declarations that errored while loading.',
    run(ctx) {
      const failed = (ctx.probe.fonts || []).filter((f) => f.status === 'error');
      const seen = new Set();
      const findings = [];
      for (const f of failed) {
        if (seen.has(f.family)) continue;
        seen.add(f.family);
        findings.push({
          ruleId: 'unloaded-webfont',
          severity: 'medium',
          category: 'typography',
          wcag: 'Visual Craft',
          selector: 'head',
          message: `Webfont ${f.family} (weight ${f.weight}) failed to load.`,
          evidence: f,
          fix: `Verify the font URL, CORS headers, or local font asset path for ${f.family}.`,
        });
      }
      return findings;
    },
  },
];
